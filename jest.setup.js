// jest.setup.js
import '@testing-library/jest-dom';
// Simple IntersectionObserver polyfill for jsdom tests
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
	class FakeIntersectionObserver {
		constructor(callback) { this.callback = callback; }
		observe() { /* noop */ }
		unobserve() { /* noop */ }
		disconnect() { /* noop */ }
		takeRecords() { return []; }
	}
	// @ts-ignore
	window.IntersectionObserver = FakeIntersectionObserver;
}