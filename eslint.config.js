import larvit from "@larvit/eslint-config-typescript-esm";
import globals from "globals";

export default [
	...larvit,
	{
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		// README → Runtimes: the browser floor is Chrome 80, Firefox 74 and Safari 14.1, and the
		// logical assignments `??=`, `||=` and `&&=` need Chrome 85 and Firefox 79.
		files: ["index.ts"],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					message: "Logical assignment parses only from Chrome 85 and Firefox 79; write `x = x ?? y`.",
					selector: "AssignmentExpression[operator=/^(\\?\\?|\\|\\||&&)=$/]",
				},
			],
		},
	},
];
