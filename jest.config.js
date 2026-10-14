module.exports = {
  preset: "jest-expo",
  // The navigation smoke tests render the whole route tree; a cold transform cache (every CI run) makes
  // the first of them slow, so the default 5 s is too tight.
  testTimeout: 20000,
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testPathIgnorePatterns: ["/node_modules/", "/android/"],
};
