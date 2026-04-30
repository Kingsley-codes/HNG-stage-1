module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "test",
        "chore",
        "ci",
        "perf",
        "revert",
      ],
    ],
    "subject-case": [2, "never", ["upper-case"]],
    "subject-full-stop": [2, "never", "."],
    "type-case": [2, "always", "lowercase"],
    "type-empty": [2, "never"],
    "subject-empty": [2, "never"],
  },
};
