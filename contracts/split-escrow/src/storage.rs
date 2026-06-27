use soroban_sdk::{contracttype, Address};

/// Storage keys. `Bill` and `Contribution` live in *persistent* storage (they
/// must outlive the contract instance); `Admin`/`Token`/`Paused`/`Counter`
/// live in *instance* storage so they share the instance's TTL.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Paused,
    Counter,
    /// bill id -> Bill
    Bill(u32),
    /// (bill id, contributor) -> i128 amount contributed (for refunds)
    Contribution(u32, Address),
}

// Soroban ledgers close ~every 5s → 17,280 ledgers/day.
pub const DAY_IN_LEDGERS: u32 = 17_280;

// Keep the contract instance (admin/config) alive for ~30 days, re-bumped on
// every state-changing call.
pub const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
pub const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;

// Bills (and their contribution markers) are bumped to ~90 days so escrowed
// funds can never be stranded by entry expiry before release or refund.
pub const BILL_BUMP_AMOUNT: u32 = 90 * DAY_IN_LEDGERS;
pub const BILL_LIFETIME_THRESHOLD: u32 = BILL_BUMP_AMOUNT - DAY_IN_LEDGERS;
