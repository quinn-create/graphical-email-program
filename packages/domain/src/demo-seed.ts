import { newId, sha256 } from "./ids.js";

/** Fictional demo data only — never real client information. */
export function buildDemoSeed() {
  const now = Date.now();
  const matters = [
    {
      id: newId("matter"),
      clioMatterId: "demo-matter-1001",
      displayNumber: "2026-CR-0142",
      description: "State v. Jonathan Roberts — warrant matter",
      status: "open",
      clientName: "Jonathan Roberts",
      court: "General Sessions",
      county: "Davidson",
      caseNumber: "26-GS-12345",
      docketNumber: "26-GS-12345",
      warrantNumber: "W-2026-8891",
      practiceArea: "Criminal Defense",
    },
    {
      id: newId("matter"),
      clioMatterId: "demo-matter-1002",
      displayNumber: "2026-CR-0201",
      description: "State v. Jonathan Roberson — similar name matter",
      status: "open",
      clientName: "Jonathan Roberson",
      court: "General Sessions",
      county: "Davidson",
      caseNumber: "26-GS-12999",
      docketNumber: "26-GS-12999",
      warrantNumber: null,
      practiceArea: "Criminal Defense",
    },
    {
      id: newId("matter"),
      clioMatterId: "demo-matter-1003",
      displayNumber: "2025-JV-0088",
      description: "In re A.M. — juvenile Quest matter",
      status: "open",
      clientName: "A.M. (Juvenile)",
      court: "Juvenile Court",
      county: "Shelby",
      caseNumber: "JV-25-0088",
      docketNumber: "JV-25-0088",
      warrantNumber: null,
      practiceArea: "Juvenile",
    },
    {
      id: newId("matter"),
      clioMatterId: "demo-matter-1004",
      displayNumber: "2024-CV-0555",
      description: "Closed civil matter — Acme Retail dispute",
      status: "closed",
      clientName: "Acme Holdings LLC",
      court: "Circuit Court",
      county: "Knox",
      caseNumber: "24-CV-0555",
      docketNumber: "24-CV-0555",
      warrantNumber: null,
      practiceArea: "Civil Litigation",
    },
  ];

  const messages = [
    {
      id: newId("msg"),
      gmailMessageId: "demo-msg-clerk-001",
      gmailThreadId: "demo-thread-clerk-001",
      direction: "received" as const,
      subject: "Warrant issued — Jonathan Roberts — Docket 26-GS-12345",
      snippet: "Please find attached warrant for Jonathan Roberts, docket 26-GS-12345.",
      bodyText:
        "Clerk of Court\n\nWarrant attached for Jonathan Roberts.\nDocket: 26-GS-12345\nCounty: Davidson\n",
      from: { email: "clerk@courts.example.gov", displayName: "Court Clerk" },
      isQuest: false,
      scenario: "clerk-many-cases",
    },
    {
      id: newId("msg"),
      gmailMessageId: "demo-msg-attorney-001",
      gmailThreadId: "demo-thread-attorney-001",
      direction: "received" as const,
      subject: "Discovery production — Roberson matter",
      snippet: "Counsel — discovery materials for Jonathan Roberson.",
      bodyText:
        "Hi,\nAttached discovery for Jonathan Roberson, docket 26-GS-12999.\n— Opposing counsel\n",
      from: { email: "counsel@lawfirm.example.com", displayName: "Alex Counsel" },
      isQuest: false,
      scenario: "another-attorney",
    },
    {
      id: newId("msg"),
      gmailMessageId: "demo-msg-newsletter-001",
      gmailThreadId: "demo-thread-newsletter-001",
      direction: "received" as const,
      subject: "Weekend deals from RetailMart!",
      snippet: "Save big this weekend on office supplies.",
      bodyText: "RetailMart newsletter — not case related.\nUnsubscribe anytime.",
      from: { email: "deals@retailmart.example.com", displayName: "RetailMart" },
      isQuest: false,
      scenario: "personal-advertising",
    },
    {
      id: newId("msg"),
      gmailMessageId: "demo-msg-quest-001",
      gmailThreadId: "demo-thread-quest-001",
      direction: "received" as const,
      subject: "Quest notification — juvenile filing available",
      snippet: "A Quest document is ready for review.",
      bodyText:
        "Quest Case Portal\nJuvenile matter update for A.M.\nOpen: https://quest.example.gov/cases/JV-25-0088/documents/abc\n",
      from: { email: "noreply@quest.example.gov", displayName: "Quest Notifications" },
      isQuest: true,
      scenario: "quest-email",
    },
  ];

  const attachments = [
    {
      id: newId("att"),
      messageGmailId: "demo-msg-clerk-001",
      filename: "warrant-26-GS-12345.pdf",
      mimeType: "application/pdf",
      sha256: sha256("fictional-warrant-pdf-content"),
      textContent:
        "CRIMINAL WARRANT\nState of Tennessee\nJonathan Roberts\nDocket Number: 26-GS-12345\nWarrant: W-2026-8891\nDavidson County General Sessions\n",
    },
    {
      id: newId("att"),
      messageGmailId: "demo-msg-quest-001",
      filename: "quest-docket-AM.pdf",
      mimeType: "application/pdf",
      sha256: sha256("fictional-quest-pdf-content"),
      textContent:
        "QUEST JUVENILE DOCKET\nIn re A.M.\nCase: JV-25-0088\nShelby County Juvenile Court\nPage 1 of 2 — case summary\nPage 2 of 2 — general docket calendar (do not upload)\n",
    },
  ];

  return { matters, messages, attachments, seededAt: now };
}

export type DemoSeed = ReturnType<typeof buildDemoSeed>;
