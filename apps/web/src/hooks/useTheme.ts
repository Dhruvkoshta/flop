import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "flop-theme";

function getInitialTheme(): Theme {
	const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
	if (stored === "dark" || stored === "light") return stored;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	if (theme === "dark") {
		root.classList.add("dark");
	} else {
		root.classList.remove("dark");
	}
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(() => {
		// SSR-safe: default to light, reconcile in effect
		return "light";
	});

	// Apply initial theme on mount
	useEffect(() => {
		const initial = getInitialTheme();
		setThemeState(initial);
		applyTheme(initial);
	}, []);

	const setTheme = useCallback((next: Theme) => {
		setThemeState(next);
		applyTheme(next);
		localStorage.setItem(STORAGE_KEY, next);
	}, []);

	const toggle = useCallback(() => {
		setThemeState((current) => {
			const next: Theme = current === "dark" ? "light" : "dark";
			applyTheme(next);
			localStorage.setItem(STORAGE_KEY, next);
			return next;
		});
	}, []);

	return { theme, setTheme, toggle };
}
