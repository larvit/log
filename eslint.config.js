import globals from "globals";
import larvit from "@larvit/eslint-config-typescript-esm";
import perfectionist from "eslint-plugin-perfectionist";

// An import sorts on its first binding, never its path, so moving a module doesn't reorder anything.
const sortImports = {
	ignoreCase: false,
	order: "asc",
	sortBy: "specifier",
	type: "natural",
};

export default [
	...larvit,
	{
		languageOptions: {
			globals: globals.node,
		},
		rules: {
			"simple-import-sort/imports": "off",
		},
	},
	{
		// The shared config registers perfectionist for these files already.
		files: ["**/*.ts"],
		rules: {
			"perfectionist/sort-imports": ["error", { ...sortImports, groups: [["value-import", "type-import"]], newlinesBetween: 0 }],
		},
	},
	{
		// The e2e scripts and this config group host modules, packages and our own code by kind, as the principle allows.
		files: ["**/*.js", "**/*.mjs"],
		plugins: { perfectionist },
		rules: {
			"perfectionist/sort-imports": ["error", { ...sortImports, groups: ["builtin", "external", ["internal", "parent", "sibling", "index"]], newlinesBetween: 1 }],
		},
	},
];
