import { redactedPath } from "./path.js";
import { redactedQuery } from "./query.js";

// The url log.fetch traces, and the only kind buildUrlFull below can rebuild without a credential: a
// scheme written without "//" parses to an opaque path, where userinfo, or a data: payload, sits in
// pathname and would ride into url.full.
export function parseHttpUrl(input: string | URL, baseHref: string | undefined): URL | undefined {
	let url: URL;

	try {
		url = new URL(String(input), baseHref);
	} catch {
		return undefined;
	}

	return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
}

// `url.origin` omits userinfo, which is what keeps the outer url's credentials off the span.
export function buildUrlFull(url: URL, captureQuery: boolean): string {
	const base = url.origin + redactedPath(url.pathname);

	return !captureQuery || !url.search ? base : `${base}?${redactedQuery(url) ?? url.searchParams.toString()}`;
}
