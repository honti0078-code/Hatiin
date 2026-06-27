use soroban_sdk::contracterror;

/// All failure modes are explicit, contiguous `u32` codes so the TypeScript
/// client can map them to user-facing messages without guessing.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorized = 3,
    Paused = 4,
    InvalidAmount = 5,
    InvalidShares = 6,
    InvalidDeadline = 7,
    BillNotFound = 8,
    BillNotOpen = 9,
    Expired = 10,
    NotYetExpired = 11,
    AlreadyFunded = 12,
    NotFunded = 13,
    NothingToRefund = 14,
    Overfunded = 15,
}
