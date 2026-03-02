import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
	className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
	const { theme, toggle } = useTheme();

	return (
		<button
			type="button"
			onClick={toggle}
			aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
			className={cn(
				"flex items-center justify-center w-8 h-8 border border-border text-muted-foreground hover:text-foreground hover:border-primary/60 transition-colors",
				className,
			)}
		>
			{theme === "dark" ? (
				<Sun className="h-3.5 w-3.5" />
			) : (
				<Moon className="h-3.5 w-3.5" />
			)}
		</button>
	);
}
