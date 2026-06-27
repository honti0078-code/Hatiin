use soroban_sdk::{contracttype, Address};

/// Lifecycle of a split bill. A bill is created `Open`; it becomes `Settled`
/// once it is fully funded and the pooled total is released to the creator, or
/// `Cancelled` if the creator/admin abandons it (which opens the refund path
/// so every contributor can reclaim what they put in).
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum BillStatus {
    Open = 0,
    Settled = 1,
    Cancelled = 2,
}

/// A single split-the-bill escrow. The contract custodies `funded_amount` of
/// `token` until the bill is fully funded (then it is released to `creator`) or
/// abandoned (then each contributor refunds their own share).
#[contracttype]
#[derive(Clone)]
pub struct Bill {
    /// Payout address — receives the pooled total once fully funded.
    pub creator: Address,
    /// Stellar Asset Contract (SAC) address of the escrowed asset (native XLM).
    pub token: Address,
    /// Target total in the token's minor units (stroops for XLM = 7 decimals).
    pub total_amount: i128,
    /// Sum of all contributions still held in escrow.
    pub funded_amount: i128,
    /// Expected number of participant shares (informational).
    pub num_shares: u32,
    /// Shares paid so far.
    pub paid_shares: u32,
    /// Unix timestamp (ledger time) after which the bill is abandonable: an
    /// unfunded bill past this point can be refunded by its contributors.
    pub deadline: u64,
    pub status: BillStatus,
}
