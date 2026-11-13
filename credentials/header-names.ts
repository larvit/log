// One rule for the credential headers a span redacts and a send warns of. Elastic APM's default `sanitize_field_names`, plus the spec's optional `cookie`.
const SENSITIVE_HEADER_NAME = /^(cookie|passwd|password|pwd|secret|set-cookie)$|key$|auth|card|credit|principal|session|token/;

export function isCredentialHeaderName(name: string): boolean {
	return SENSITIVE_HEADER_NAME.test(name.toLowerCase());
}
