import type { LookupResponse } from "./types";

export const exampleResult: LookupResponse = {
  pageId: "04f306fb-f59a-413f-ae15-f42e2a1ab029",
  cached: false,
  timestamp: new Date().toISOString(),
  collaborators: [
    {
      id: "310af75a-0000-4000-8000-000000000001",
      name: "Emma Example",
      email: "emma@makenotion.com",
      profilePhoto: null,
      role: "editor",
      company: "Notion",
      companyDomain: "makenotion.com",
      isWorkEmail: true,
      jobSignals: {
        contactPriority: "high",
        reason: "Work email at Notion; page role is editor.",
        linkedinQuery: '"Emma Example" "Notion" site:linkedin.com/in/',
        hiringQuery: '"Emma Example" "Notion" (hiring OR recruiter OR "engineering manager" OR "talent")'
      }
    },
    {
      id: "310af75a-0000-4000-8000-000000000002",
      name: "Marcus Reyes",
      email: "marcus@linear.app",
      profilePhoto: null,
      role: "reader",
      company: "Linear",
      companyDomain: "linear.app",
      isWorkEmail: true,
      jobSignals: {
        contactPriority: "medium",
        reason: "Work email at Linear; likely connected to the page or workspace.",
        linkedinQuery: '"Marcus Reyes" "Linear" site:linkedin.com/in/',
        hiringQuery: '"Marcus Reyes" "Linear" (hiring OR recruiter OR "engineering manager" OR "talent")'
      }
    },
    {
      id: "310af75a-0000-4000-8000-000000000003",
      name: "Julia Park",
      email: "julia@gmail.com",
      profilePhoto: null,
      role: "commenter",
      company: null,
      companyDomain: null,
      isWorkEmail: false,
      jobSignals: {
        contactPriority: "low",
        reason: "No company email domain was found, so job-targeting confidence is low.",
        linkedinQuery: null,
        hiringQuery: null
      }
    }
  ]
};
