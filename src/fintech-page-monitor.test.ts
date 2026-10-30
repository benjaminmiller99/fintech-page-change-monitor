import assert from "node:assert/strict";
import { decidePageChange } from "./change-decision.ts";

const previous = { url: "https://bank.example/fees", content: "wire fee: 5" };
const current = { url: "https://bank.example/fees", content: "wire fee: 7" };
const changed = decidePageChange(previous, current);
assert.equal(changed.changed, true);
assert.match(changed.subject, /changed/);

const same = decidePageChange(current, current);
assert.equal(same.changed, false);
assert.match(same.body, /No action is recommended/);
console.log("change decision test passed");
