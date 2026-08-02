export interface StatusCheckpoints {
  lastGmailDownload: string | null;
  lastGmailReviewSession: string | null;
  lastClioIndexRefresh: string | null;
  lastClioCommit: string | null;
  lastDriveAuditUpload: string | null;
  lastQuestEmailScan: string | null;
  approvedNotCommitted: number;
  unresolvedCaseRelated: number;
}

export const EMPTY_CHECKPOINTS: StatusCheckpoints = {
  lastGmailDownload: null,
  lastGmailReviewSession: null,
  lastClioIndexRefresh: null,
  lastClioCommit: null,
  lastDriveAuditUpload: null,
  lastQuestEmailScan: null,
  approvedNotCommitted: 0,
  unresolvedCaseRelated: 0,
};
