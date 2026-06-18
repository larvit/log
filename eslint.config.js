import larvit from "@larvit/eslint-config-typescript-esm";
import globals from "globals";

export default [
	...larvit,
	{
		languageOptions: {
			globals: globals.node,
		},
	},
];
