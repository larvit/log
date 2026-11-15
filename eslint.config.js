import larvit from "@larvit/eslint-config-typescript-esm";
import globals from "globals";
import perfectionist from "eslint-plugin-perfectionist";

export default [
	...larvit,
	{
		languageOptions: {
			globals: globals.node,
		},
		plugins: { perfectionist },
		rules: {
			// An import sorts on its first binding, never its path, so moving a module reorders nothing.
			"perfectionist/sort-imports": ["error", {
				groups: [["value-import", "type-import"]],
				ignoreCase: false,
				newlinesBetween: 0,
				order: "asc",
				sortBy: "specifier",
				type: "natural",
			}],
			"simple-import-sort/imports": "off",
		},
	},
];
