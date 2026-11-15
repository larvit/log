const SENSITIVE_QUERY_KEY = /(auth|authentication|authorization|consumerid|credential|key|keyid|pass|passphrase|p(ass)?w(or)?d[12]?|secret|sig|sign|signature|signed|token)$|^(code|googleaccessid|idtokenhint)$/;

export function isListedQueryKey(key: string): boolean {
	return SENSITIVE_QUERY_KEY.test(key.toLowerCase().replace(/[-_]/g, ""));
}
