// Shared configuration for the WordNerd functions. Model names and providers are configuration, never
// hard-coded in calling code.

export const REGION = 'europe-west1';
export const APP = 'wordnerd'; // Hub app key: entitlements.wordnerd, settings/credits.prices["wordnerd/…"]
export const ACTIONS = Object.freeze({ analyze: 'analyze' });

// Model set by András for every Hub project (2026-11-15). Do not change this name; if it is unavailable,
// stop and ask, never substitute another model.
export const MODEL = {
  provider: process.env.WN_MODEL_PROVIDER || 'gemini',
  name: process.env.WN_MODEL_NAME || 'gemini-3.8-flash',
};

// Mock model: fixed answers, no cost. Default: on in the emulator, off in production.
// Override with WN_MOCK_MODEL ("true" / "false").
export function isMockModel() {
  const flag = process.env.WN_MOCK_MODEL;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.FUNCTIONS_EMULATOR === 'true';
}
