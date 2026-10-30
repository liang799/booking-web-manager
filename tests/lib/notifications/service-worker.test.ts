import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";

function pushedTag(payload: object) {
  let push!: (event: object) => void;
  let tag: string | undefined;
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      addEventListener: (type: string, handler: (event: object) => void) => { if (type === "push") push = handler; },
      registration: { showNotification: (_title: string, options: {tag: string}) => { tag = options.tag; return Promise.resolve(); } },
    }, URL,
  });
  push({data:{json:()=>payload},waitUntil:()=>{}});
  return tag;
}
test("different occurrences of the same event keep separate stable push tags", () => {
  expect(pushedTag({kind:"GROUP_INVITATION",notificationId:"first"})).toBe("first");
  expect(pushedTag({kind:"GROUP_INVITATION",notificationId:"second"})).toBe("second");
});
test("legacy commitment payloads retain their original tag", () => {
  expect(pushedTag({kind:"PROMOTED",sessionId:"session"})).toBe("PROMOTED:session");
});
