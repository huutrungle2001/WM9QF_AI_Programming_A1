// Run with a disposable, seeded API and a loopback Next.js instance:
// node --test client/tests/actor-role.e2e.mjs (A1_E2E_URL defaults to http://127.0.0.1:13083)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const url = new URL("/bookings", process.env.A1_E2E_URL ?? "http://127.0.0.1:13083");
assert.equal(url.protocol, "http:");
assert.equal(url.hostname, "127.0.0.1");

function orca(...args) {
  const output = execFileSync(process.env.ORCA_CLI_COMMAND || "orca", [...args, "--json"], {
    encoding: "utf8",
    timeout: 25_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const response = JSON.parse(output);
  assert.equal(response.ok, true, JSON.stringify(response.error));
  return response.result;
}

test("booking data is scoped to the active demo actor on switch and reload", () => {
  const { browserPageId } = orca("tab", "create", "--url", url.href);
  const page = (...args) => orca(...args, "--page", browserPageId);
  const read = (expression) => JSON.parse(page("eval", "--expression", expression).result);
  const waitForRows = () => page("wait", "--selector", "main tbody tr");
  const roleRef = (pattern) => {
    const { refs } = page("snapshot", "--interactive", "--depth", "5");
    const match = Object.entries(refs).find(([, entry]) =>
      entry.role === "button" && pattern.test(entry.name));
    assert.ok(match, `No role control matches ${pattern}`);
    return `@${match[0]}`;
  };
  const chooseRole = (pattern) => {
    page("click", "--element", roleRef(/Administrator|Campus Member|Student Services$/));
    page("click", "--element", roleRef(pattern), "--expect-url", url.href);
    waitForRows();
  };
  const userCells = () => read(`JSON.stringify(Array.from(
    document.querySelectorAll('main tbody tr'), row => row.cells[1].innerText))`);

  try {
    waitForRows();
    chooseRole(/^Admin ADMIN1/);
    assert.ok(new Set(userCells()).size > 1, "admin should see multiple users");

    chooseRole(/^PG Student S1001/);
    const assertMemberRows = () => {
      const users = userCells();
      assert.ok(users.length);
      assert.ok(users.every((cell) => cell.split("\n").includes("S1001")),
        "all booking rows must belong to the selected member");
    };
    assertMemberRows();
    page("reload");
    waitForRows();
    assertMemberRows();
    assert.equal(read(`JSON.stringify(performance.getEntriesByType('resource')
      .filter(entry => entry.initiatorType === 'fetch' &&
        new URL(entry.name).pathname === '/api/v1/bookings').length)`), 1,
      "reload should not issue a booking request for the default admin");

    chooseRole(/^Admin ADMIN1/);
    chooseRole(/^Student Services SS1/);
    const users = userCells();
    assert.ok(users.length && users.every((cell) => cell.startsWith("ANON-")));
    assert.equal(read(`JSON.stringify(document.querySelectorAll('main tbody tr button').length)`), 0);
  } finally {
    orca("tab", "close", "--page", browserPageId);
  }
});
