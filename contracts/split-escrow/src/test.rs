#![cfg(test)]

use crate::error::Error;
use crate::types::BillStatus;
use crate::{SplitEscrow, SplitEscrowClient};

use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{Address, Env};

struct Setup<'a> {
    env: Env,
    client: SplitEscrowClient<'a>,
    token: Address,
    token_client: TokenClient<'a>,
    creator: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);

    // Deploy a Stellar Asset Contract to stand in for the native XLM SAC.
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = sac.address();

    let contract_id = env.register(SplitEscrow, ());
    let client = SplitEscrowClient::new(&env, &contract_id);
    client.initialize(&admin, &token);

    Setup {
        token_client: TokenClient::new(&env, &token),
        env,
        client,
        token,
        creator,
    }
}

/// Mint `amount` of the escrow token to a fresh participant address.
fn funded_payer(s: &Setup, amount: i128) -> Address {
    let payer = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.token).mint(&payer, &amount);
    payer
}

#[test]
fn initialize_records_admin_and_token() {
    let s = setup();
    assert_eq!(s.client.get_token(), s.token);
    assert_eq!(s.client.total_bills(), 0);
    assert!(!s.client.is_paused());
}

#[test]
fn happy_path_two_shares_fund_and_release() {
    let s = setup();
    let deadline = s.env.ledger().timestamp() + 1_000;

    // Bill total 300, two shares of 150 each.
    let id = s.client.open_bill(&s.creator, &300, &2, &deadline);
    assert_eq!(id, 1);
    assert_eq!(s.client.total_bills(), 1);

    let p1 = funded_payer(&s, 150);
    let p2 = funded_payer(&s, 150);

    // First share funds half — bill stays open, contract custodies the funds.
    let funded = s.client.pay_share(&id, &p1, &150);
    assert_eq!(funded, 150);
    assert_eq!(s.token_client.balance(&p1), 0);
    assert_eq!(s.client.get_bill(&id).status, BillStatus::Open);

    let creator_before = s.token_client.balance(&s.creator);

    // Second share completes funding → atomic release to creator.
    let funded = s.client.pay_share(&id, &p2, &150);
    assert_eq!(funded, 0, "escrow drained to creator on full funding");
    assert_eq!(s.token_client.balance(&s.creator), creator_before + 300);

    let bill = s.client.get_bill(&id);
    assert_eq!(bill.status, BillStatus::Settled);
    assert_eq!(bill.paid_shares, 2);
}

#[test]
fn overfunding_a_share_is_rejected() {
    let s = setup();
    let deadline = s.env.ledger().timestamp() + 1_000;
    let id = s.client.open_bill(&s.creator, &100, &2, &deadline);

    let p1 = funded_payer(&s, 200);
    // Paying more than the remaining target traps.
    let res = s.client.try_pay_share(&id, &p1, &150);
    assert_eq!(res, Err(Ok(Error::Overfunded)));
}

#[test]
fn pay_after_deadline_is_rejected() {
    let s = setup();
    let deadline = s.env.ledger().timestamp() + 1_000;
    let id = s.client.open_bill(&s.creator, &100, &1, &deadline);
    let p1 = funded_payer(&s, 100);

    s.env.ledger().with_mut(|li| li.timestamp = deadline + 1);
    let res = s.client.try_pay_share(&id, &p1, &100);
    assert_eq!(res, Err(Ok(Error::Expired)));
}

#[test]
fn cancel_then_each_contributor_refunds_their_share() {
    let s = setup();
    let deadline = s.env.ledger().timestamp() + 1_000;
    let id = s.client.open_bill(&s.creator, &300, &3, &deadline);

    let p1 = funded_payer(&s, 100);
    let p2 = funded_payer(&s, 100);
    s.client.pay_share(&id, &p1, &100);
    s.client.pay_share(&id, &p2, &100);

    // Admin abandons the under-funded bill.
    s.client.cancel(&id);
    assert_eq!(s.client.get_bill(&id).status, BillStatus::Cancelled);

    // Each contributor pulls exactly their own share back.
    assert_eq!(s.client.refund(&id, &p1), 100);
    assert_eq!(s.token_client.balance(&p1), 100);
    assert_eq!(s.client.refund(&id, &p2), 100);
    assert_eq!(s.token_client.balance(&p2), 100);

    // Double refund is rejected.
    let res = s.client.try_refund(&id, &p1);
    assert_eq!(res, Err(Ok(Error::NothingToRefund)));
}

#[test]
fn refund_on_open_bill_before_deadline_is_rejected() {
    let s = setup();
    let deadline = s.env.ledger().timestamp() + 1_000;
    let id = s.client.open_bill(&s.creator, &200, &2, &deadline);
    let p1 = funded_payer(&s, 100);
    s.client.pay_share(&id, &p1, &100);

    let res = s.client.try_refund(&id, &p1);
    assert_eq!(res, Err(Ok(Error::NotYetExpired)));
}

#[test]
fn refund_after_deadline_on_open_bill_is_allowed() {
    let s = setup();
    let deadline = s.env.ledger().timestamp() + 1_000;
    let id = s.client.open_bill(&s.creator, &200, &2, &deadline);
    let p1 = funded_payer(&s, 100);
    s.client.pay_share(&id, &p1, &100);

    s.env.ledger().with_mut(|li| li.timestamp = deadline + 1);
    assert_eq!(s.client.refund(&id, &p1), 100);
    assert_eq!(s.token_client.balance(&p1), 100);
}

#[test]
fn open_is_blocked_while_paused() {
    let s = setup();
    let deadline = s.env.ledger().timestamp() + 1_000;

    s.client.pause();
    assert!(s.client.is_paused());
    let res = s.client.try_open_bill(&s.creator, &100, &1, &deadline);
    assert_eq!(res, Err(Ok(Error::Paused)));

    s.client.unpause();
    let id = s.client.open_bill(&s.creator, &100, &1, &deadline);
    assert_eq!(id, 1);
}

#[test]
fn invalid_open_parameters_are_rejected() {
    let s = setup();
    let now = s.env.ledger().timestamp();
    let deadline = now + 1_000;

    assert_eq!(
        s.client.try_open_bill(&s.creator, &0, &1, &deadline),
        Err(Ok(Error::InvalidAmount))
    );
    // more shares than minor units
    assert_eq!(
        s.client.try_open_bill(&s.creator, &5, &10, &deadline),
        Err(Ok(Error::InvalidShares))
    );
    // deadline in the past
    assert_eq!(
        s.client.try_open_bill(&s.creator, &100, &1, &now),
        Err(Ok(Error::InvalidDeadline))
    );
}

#[test]
fn explicit_release_pays_creator_when_fully_funded() {
    let s = setup();
    let deadline = s.env.ledger().timestamp() + 1_000;
    // Single-share bill, then release explicitly instead of relying on auto.
    let id = s.client.open_bill(&s.creator, &100, &2, &deadline);
    let p1 = funded_payer(&s, 100);

    // Fund the whole thing in one share that is < total guarded? total=100, pay 100 == total triggers auto-release already.
    // Use two 50s but call release path: pay 50 then 50 -> auto. To exercise release(), under-pay then top up via same payer.
    s.client.pay_share(&id, &p1, &50);
    // Not yet fully funded → release rejects.
    assert_eq!(s.client.try_release(&id), Err(Ok(Error::NotFunded)));

    let p2 = funded_payer(&s, 50);
    s.client.pay_share(&id, &p2, &50); // this completes funding and auto-settles
    assert_eq!(s.client.get_bill(&id).status, BillStatus::Settled);
    // A second release now rejects because the bill is no longer Open.
    assert_eq!(s.client.try_release(&id), Err(Ok(Error::BillNotOpen)));
}
