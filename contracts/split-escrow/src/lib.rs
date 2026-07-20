#![no_std]
//! # Split Escrow
//!
//! A Soroban smart contract that powers **Hatiin** — split-the-bill group
//! payments — with real on-chain escrow instead of a custodial backend.
//!
//! ## The flow it enforces
//! 1. **`open_bill`** — the app (admin) opens a bill for a `total_amount`,
//!    naming the `creator` who will be paid.
//! 2. **`pay_share`** — each participant signs a payment of their share; the
//!    funds move *into the contract*, never to the backend.
//! 3. **release** — the instant the pooled balance reaches `total_amount`, the
//!    same `pay_share` call atomically releases the whole pot to the `creator`.
//!    No one can release early, and the money can't be diverted.
//! 4. **`refund`** — if a bill is abandoned (cancelled, or left unfunded past
//!    its `deadline`), every contributor can pull *their own* share back. Funds
//!    are never stuck.
//!
//! ## Advanced features
//! - **Token escrow via the Stellar Asset Contract (SAC)** — real XLM custody,
//!   so any funded wallet can settle with no trustline.
//! - **Atomic fund-and-release** — the bill settles to the creator in the very
//!   transaction that completes the funding; no second "claim" step to forget.
//! - **Per-contributor refund ledger** — each share is tracked, so an abandoned
//!   bill refunds exactly what each person paid, no more, no less.
//! - **Authorization** — `require_auth` on the payer (pay/refund) and the admin
//!   (open/cancel); the contract pays out from its own address.
//! - **Events** — `init`, `open`, `pay`, `settle`, `cancel`, `refund`.
//! - **Pausable admin + upgradeable Wasm** — operational safety for mainnet.
//! - **Storage TTL management** — instance and bill entries are bumped so an
//!   escrow never expires out from under a pending contribution or refund.

mod error;
mod storage;
mod types;

#[cfg(test)]
mod test;

use error::Error;
use storage::{
    DataKey, BILL_BUMP_AMOUNT, BILL_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT,
    INSTANCE_LIFETIME_THRESHOLD,
};
use types::{Bill, BillStatus};

use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env};

#[contract]
pub struct SplitEscrow;

#[contractimpl]
impl SplitEscrow {
    /// One-time setup. Records the admin and the escrow token (the native XLM
    /// SAC on testnet) and unpauses the contract.
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::Counter, &0u32);
        bump_instance(&env);
        env.events().publish((symbol_short!("init"),), (admin, token));
        Ok(())
    }

    /// Open a new split bill and return its id.
    ///
    /// Auth: the **admin** signs. The app opens bills on behalf of creators (a
    /// creator only supplies a receiving address, they need not have a wallet
    /// connected). No funds move here — money only flows on `pay_share`.
    pub fn open_bill(
        env: Env,
        creator: Address,
        total_amount: i128,
        num_shares: u32,
        deadline: u64,
    ) -> Result<u32, Error> {
        admin(&env)?.require_auth();
        require_not_paused(&env)?;

        if total_amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if num_shares == 0 || (num_shares as i128) > total_amount {
            return Err(Error::InvalidShares);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(Error::InvalidDeadline);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)?;

        let id = next_id(&env);
        let bill = Bill {
            creator: creator.clone(),
            token,
            total_amount,
            funded_amount: 0,
            num_shares,
            paid_shares: 0,
            deadline,
            status: BillStatus::Open,
        };
        save_bill(&env, id, &bill);
        bump_instance(&env);

        env.events()
            .publish((symbol_short!("open"), id), (creator, total_amount, num_shares));
        Ok(id)
    }

    /// Pay one participant's `amount` into the bill's escrow.
    ///
    /// Auth: the **payer** signs (the same authorization covers the inner SAC
    /// `transfer(payer -> contract)`). When this payment completes the bill's
    /// funding, the whole pot is released to the creator in the same call.
    /// Returns the bill's funded amount after this contribution.
    pub fn pay_share(
        env: Env,
        bill_id: u32,
        payer: Address,
        amount: i128,
    ) -> Result<i128, Error> {
        payer.require_auth();
        require_not_paused(&env)?;

        let mut bill = load_bill(&env, bill_id)?;
        if bill.status != BillStatus::Open {
            return Err(Error::BillNotOpen);
        }
        if env.ledger().timestamp() >= bill.deadline {
            return Err(Error::Expired);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if bill.funded_amount + amount > bill.total_amount {
            return Err(Error::Overfunded);
        }

        // Pull the contribution into the contract's custody.
        token::Client::new(&env, &bill.token).transfer(
            &payer,
            &env.current_contract_address(),
            &amount,
        );

        // Track this contributor's running total (enables a precise refund).
        let contrib_key = DataKey::Contribution(bill_id, payer.clone());
        let prior: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);
        env.storage().persistent().set(&contrib_key, &(prior + amount));
        env.storage().persistent().extend_ttl(
            &contrib_key,
            BILL_LIFETIME_THRESHOLD,
            BILL_BUMP_AMOUNT,
        );

        bill.funded_amount += amount;
        bill.paid_shares += 1;

        env.events()
            .publish((symbol_short!("pay"), bill_id), (payer, amount, bill.funded_amount));

        // Atomic release: the moment the pot is full, pay the creator.
        if bill.funded_amount >= bill.total_amount {
            let payout = bill.funded_amount;
            token::Client::new(&env, &bill.token).transfer(
                &env.current_contract_address(),
                &bill.creator,
                &payout,
            );
            bill.funded_amount = 0;
            bill.status = BillStatus::Settled;
            env.events()
                .publish((symbol_short!("settle"), bill_id), (bill.creator.clone(), payout));
        }

        save_bill(&env, bill_id, &bill);
        bump_instance(&env);
        Ok(bill.funded_amount)
    }

    /// Explicitly release a fully-funded bill to its creator. Normally
    /// `pay_share` releases automatically; this is a safety valve.
    pub fn release(env: Env, bill_id: u32) -> Result<i128, Error> {
        let mut bill = load_bill(&env, bill_id)?;
        if bill.status != BillStatus::Open {
            return Err(Error::BillNotOpen);
        }
        if bill.funded_amount < bill.total_amount {
            return Err(Error::NotFunded);
        }
        let payout = bill.funded_amount;
        token::Client::new(&env, &bill.token).transfer(
            &env.current_contract_address(),
            &bill.creator,
            &payout,
        );
        bill.funded_amount = 0;
        bill.status = BillStatus::Settled;
        save_bill(&env, bill_id, &bill);
        bump_instance(&env);
        env.events()
            .publish((symbol_short!("settle"), bill_id), (bill.creator.clone(), payout));
        Ok(payout)
    }

    /// Abandon an open bill (admin-gated). Opens the refund path so every
    /// contributor can reclaim their share.
    pub fn cancel(env: Env, bill_id: u32) -> Result<(), Error> {
        admin(&env)?.require_auth();
        let mut bill = load_bill(&env, bill_id)?;
        if bill.status != BillStatus::Open {
            return Err(Error::BillNotOpen);
        }
        bill.status = BillStatus::Cancelled;
        save_bill(&env, bill_id, &bill);
        bump_instance(&env);
        env.events().publish((symbol_short!("cancel"), bill_id), bill.creator.clone());
        Ok(())
    }

    /// Reclaim a contributor's share from an abandoned bill.
    ///
    /// Allowed when the bill is `Cancelled`, or still `Open` but past its
    /// `deadline` (the creator never collected). Auth: the **payer** signs.
    pub fn refund(env: Env, bill_id: u32, payer: Address) -> Result<i128, Error> {
        payer.require_auth();
        let bill = load_bill(&env, bill_id)?;

        let abandoned = bill.status == BillStatus::Cancelled
            || (bill.status == BillStatus::Open && env.ledger().timestamp() >= bill.deadline);
        if !abandoned {
            return Err(Error::NotYetExpired);
        }

        let contrib_key = DataKey::Contribution(bill_id, payer.clone());
        let contributed: i128 = env.storage().persistent().get(&contrib_key).unwrap_or(0);
        if contributed <= 0 {
            return Err(Error::NothingToRefund);
        }

        token::Client::new(&env, &bill.token).transfer(
            &env.current_contract_address(),
            &payer,
            &contributed,
        );

        // Zero out so a contributor cannot double-refund.
        env.storage().persistent().set(&contrib_key, &0i128);

        let mut updated = bill;
        updated.funded_amount -= contributed;
        if updated.funded_amount < 0 {
            updated.funded_amount = 0;
        }
        save_bill(&env, bill_id, &updated);
        bump_instance(&env);

        env.events()
            .publish((symbol_short!("refund"), bill_id), (payer, contributed));
        Ok(contributed)
    }

    // --- Views -------------------------------------------------------------

    pub fn get_bill(env: Env, bill_id: u32) -> Result<Bill, Error> {
        load_bill(&env, bill_id)
    }

    pub fn get_contribution(env: Env, bill_id: u32, payer: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(bill_id, payer))
            .unwrap_or(0)
    }

    pub fn total_bills(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Counter).unwrap_or(0u32)
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)
    }

    pub fn get_token(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)
    }

    // --- Admin -------------------------------------------------------------

    pub fn pause(env: Env) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        bump_instance(&env);
        env.events().publish((symbol_short!("pause"),), true);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        bump_instance(&env);
        env.events().publish((symbol_short!("pause"),), false);
        Ok(())
    }

    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        bump_instance(&env);
        Ok(())
    }

    /// Replace the contract's own code (admin-gated). Ships fixes without
    /// migrating escrow state — important for a mainnet (L6) deploy.
    pub fn upgrade(env: Env, new_wasm_hash: soroban_sdk::BytesN<32>) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }
}

// --- Internal helpers ------------------------------------------------------

fn admin(env: &Env) -> Result<Address, Error> {
    env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)
}

fn require_not_paused(env: &Env) -> Result<(), Error> {
    let paused: bool = env
        .storage()
        .instance()
        .get(&DataKey::Paused)
        .ok_or(Error::NotInitialized)?;
    if paused {
        return Err(Error::Paused);
    }
    Ok(())
}

fn next_id(env: &Env) -> u32 {
    let current: u32 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0u32);
    let id = current + 1;
    env.storage().instance().set(&DataKey::Counter, &id);
    id
}

fn load_bill(env: &Env, id: u32) -> Result<Bill, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Bill(id))
        .ok_or(Error::BillNotFound)
}

fn save_bill(env: &Env, id: u32, bill: &Bill) {
    let key = DataKey::Bill(id);
    env.storage().persistent().set(&key, bill);
    env.storage()
        .persistent()
        .extend_ttl(&key, BILL_LIFETIME_THRESHOLD, BILL_BUMP_AMOUNT);
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}
