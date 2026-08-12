// ADR-0012 fixture: load returns an incrementing counter so a test can prove
// invalidateAll re-runs the load function. Before Phase 1 the virtual
// $app/navigation module stubbed invalidateAll as a no-op and this value
// would never change.
let loadCount = 0;

export const load = () => {
	loadCount += 1;
	return { loadCount };
};
