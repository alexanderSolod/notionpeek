import { describe, expect, it } from "vitest";
import { buildJobSignals, companyFromDomain, getEmailDomain, isPersonalEmailDomain } from "../src/domain";
import { extractPageId, extractUserReferences, parseProfiles } from "../src/notion";

describe("extractPageId", () => {
  it("extracts dashless notion.so page ids", () => {
    expect(
      extractPageId("https://www.notion.so/workspace/Page-Title-04f306fbf59a413fae15f42e2a1ab029")
    ).toBe("04f306fb-f59a-413f-ae15-f42e2a1ab029");
  });

  it("extracts dashed notion.site page ids", () => {
    expect(extractPageId("https://notion.site/Page-Title-04f306fb-f59a-413f-ae15-f42e2a1ab029")).toBe(
      "04f306fb-f59a-413f-ae15-f42e2a1ab029"
    );
  });

  it("rejects non-notion hosts", () => {
    expect(extractPageId("https://example.com/Page-Title-04f306fbf59a413fae15f42e2a1ab029")).toBeNull();
  });

  it("does not accept page ids hidden in URL fragments", () => {
    expect(extractPageId("https://www.notion.so/#04f306fbf59a413fae15f42e2a1ab029")).toBeNull();
  });
});

describe("domain enrichment", () => {
  it("maps known company domains", () => {
    expect(getEmailDomain("eyy@makenotion.com")).toBe("makenotion.com");
    expect(companyFromDomain("makenotion.com")).toBe("Notion");
  });

  it("ignores personal email domains for company inference", () => {
    expect(isPersonalEmailDomain("gmail.com")).toBe(true);
    expect(companyFromDomain("gmail.com")).toBeNull();
  });

  it("builds job-focused search queries", () => {
    expect(
      buildJobSignals({
        name: "Emma Example",
        email: "emma@makenotion.com",
        role: "editor",
        company: "Notion",
        companyDomain: "makenotion.com"
      })
    ).toMatchObject({
      contactPriority: "high",
      linkedinQuery: '"Emma Example" "Notion" site:linkedin.com/in/'
    });
  });

  it("rejects malformed email domains", () => {
    expect(getEmailDomain("eyy@example.com\nbcc@example.com")).toBeNull();
    expect(companyFromDomain("bad..example.com")).toBeNull();
  });
});

describe("notion record parsing", () => {
  it("extracts users from recordMap and permission objects", () => {
    const references = extractUserReferences({
      recordMap: {
        notion_user: {
          "310af75a-0000-4000-8000-000000000001": {}
        },
        block: {
          page: {
            value: {
              permissions: [
                {
                  type: "user_permission",
                  user_id: "310af75a-0000-4000-8000-000000000002",
                  role: "editor"
                }
              ]
            }
          }
        }
      }
    });

    expect([...references.userIds]).toEqual([
      "310af75a-0000-4000-8000-000000000001",
      "310af75a-0000-4000-8000-000000000002"
    ]);
    expect(references.rolesByUserId.get("310af75a-0000-4000-8000-000000000002")).toBe("editor");
  });

  it("rejects malformed permission user ids without truncating them", () => {
    const references = extractUserReferences({
      type: "user_permission",
      user_id: "310af75a000040008000000000000002bad",
      role: "editor"
    });

    expect([...references.userIds]).toEqual([]);
  });

  it("parses double-nested notion user profiles", () => {
    const collaborators = parseProfiles(
      {
        recordMap: {
          notion_user: {
            "310af75a-0000-4000-8000-000000000001": {
              value: {
                value: {
                  id: "310af75a-0000-4000-8000-000000000001",
                  name: "Emma Example",
                  email: "emma@makenotion.com",
                  profile_photo: "https://example.com/emma.png"
                },
                role: "reader"
              }
            }
          }
        }
      },
      new Map([["310af75a-0000-4000-8000-000000000001", "editor"]])
    );

    expect(collaborators).toEqual([
      {
        id: "310af75a-0000-4000-8000-000000000001",
        name: "Emma Example",
        email: "emma@makenotion.com",
        profilePhoto: "https://example.com/emma.png",
        role: "editor",
        company: "Notion",
        companyDomain: "makenotion.com",
        isWorkEmail: true,
        jobSignals: expect.objectContaining({
          contactPriority: "high"
        })
      }
    ]);
  });
});
