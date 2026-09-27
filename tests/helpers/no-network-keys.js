// M6.E3 (AC8.7) — no test may reach the network, by construction.
//
// The Jev client turns itself on when TYPESAFE_API_KEY is set. Tests inject
// fakes, but a test that forgets to (or a future caller of modelJudgedChecks())
// would make real requests on any machine where the key is set — and pass
// silently everywhere else. Clearing the key before any test loads makes
// "tests never call the network" hold regardless of the machine. A test that
// needs a key sets its own fake one.
delete process.env.TYPESAFE_API_KEY;
delete process.env.TYPESAFE_MODEL;
// …and never read this repository's own .env, which holds a real key.
process.env.SIGNAL_JEV_IGNORE_DOTENV = '1';

// …and no test can reach the network even with a key: the global `fetch` throws.
// The Jev client defaults to it, so a test that sets `key` but forgets to inject
// `ask`/`fetchFn` fails loudly here instead of calling the internet (REVIEW).
globalThis.fetch = async () => {
  throw new Error('network is disabled in tests — inject fetchFn/ask (tests/helpers/no-network-keys.js)');
};
