/** @type { import('@jest/types').Config.InitialOptions } */
module.exports = {
  collectCoverage: false,

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  modulePathIgnorePatterns: ['<rootDir>/dist'],
  resetMocks: true,
  resetModules: true,
  testEnvironment: 'node',
  testRegex: ['.+\\.test\\.tsx?$'],
  // verbose: true,
};
