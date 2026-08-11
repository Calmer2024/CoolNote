use serde::{Deserialize, Serialize};

use crate::infrastructure::recovery_store::RecoveryRecord;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecoveryDecision {
    OfferDraft,
    Conflict,
    DiscardDuplicate,
}

pub fn classify_recovery(
    database_revision: i64,
    database_hash: &str,
    record: &RecoveryRecord,
) -> RecoveryDecision {
    if database_hash == record.content_hash {
        RecoveryDecision::DiscardDuplicate
    } else if database_revision > record.base_revision {
        RecoveryDecision::Conflict
    } else {
        RecoveryDecision::OfferDraft
    }
}
