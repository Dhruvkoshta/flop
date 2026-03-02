import {
	ArrowRight,
	Clock,
	Eye,
	Layers,
	Lock,
	Shield,
	Zap,
} from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import Blocks from "@/components/ui/blocks";

const FEATURES = [
	{
		icon: Lock,
		title: "AES-GCM-256",
		desc: "Every file encrypted in-browser before it ever leaves your machine.",
	},
	{
		icon: Eye,
		title: "Zero Plaintext",
		desc: "The server stores only ciphertext. Your files are unreadable at rest.",
	},
	{
		icon: Layers,
		title: "Multi-File Rooms",
		desc: "Bundle any number of files into one room. One link for everything.",
	},
	{
		icon: Clock,
		title: "Auto-Expiry",
		desc: "Rooms self-destruct in 1h, 6h, 24h, 2d, or 7d. No cleanup needed.",
	},
	{
		icon: Shield,
		title: "One-Time Download",
		desc: "Optionally restrict each file to a single download. Access revoked after.",
	},
	{
		icon: Zap,
		title: "No Account",
		desc: "No signup, no tracking, no cookies. Open a room and go.",
	},
];

export function LandingPage() {
	const heroRef = useRef<HTMLDivElement>(null);

	return (
		<div className="min-h-screen bg-background text-foreground flex flex-col">
			{/* Nav */}
			<header className="border-b border-border px-6 py-4 flex items-center justify-between">
				<span className="text-xl font-bold tracking-widest uppercase">
					flop
				</span>
				<Link
					to="/send"
					className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
				>
					Send Files
					<ArrowRight className="h-3.5 w-3.5" />
				</Link>
			</header>

			{/* Hero */}
			<section
				ref={heroRef}
				className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center relative overflow-hidden"
			>
				{/* Blocks grid background */}
				<Blocks
					containerRef={heroRef}
					classname="w-full opacity-15"
					divClass="border-border/20"
					activeDivsClass="bg-primary/10"
					activeDivs={{
						0: new Set([2, 4, 6]),
						1: new Set([0, 8]),
						2: new Set([1, 3, 5]),
						4: new Set([0, 5, 8]),
						5: new Set([2, 4]),
						7: new Set([2, 6, 9]),
						8: new Set([0, 4]),
						9: new Set([5]),
						10: new Set([3, 6]),
						11: new Set([1, 5]),
						12: new Set([7]),
						13: new Set([2, 4]),
						14: new Set([5]),
						15: new Set([1, 6]),
					}}
				/>

				{/* Fade-to-background gradient overlay */}
				<div
					className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background"
					aria-hidden="true"
				/>

				{/* Glowing accent blob */}
				<div
					className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] opacity-10 blur-3xl"
					style={{ background: "var(--primary)" }}
					aria-hidden="true"
				/>

				<div className="relative z-10 max-w-3xl mx-auto space-y-8">
					{/* Badge */}
					<div className="inline-flex items-center gap-2 border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-primary">
						<span
							className="inline-block w-1.5 h-1.5 bg-primary animate-pulse"
							aria-hidden="true"
						/>
						Client-side Encryption · No Account Required
					</div>

					{/* Headline */}
					<h1 className="text-5xl sm:text-7xl font-extrabold uppercase tracking-tight leading-none">
						<span className="block">Send Files.</span>
						<span className="block text-primary">Stay Private.</span>
					</h1>

					{/* Subhead */}
					<p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
						Encrypted in your browser with AES-GCM-256. One link for all your
						files. Self-destructs on schedule.
					</p>

					{/* CTA */}
					<div className="flex flex-col sm:flex-row items-center justify-center gap-3">
						<Link
							to="/send"
							className="flex items-center gap-2 bg-primary text-primary-foreground px-8 py-4 text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
						>
							<Lock className="h-4 w-4" />
							Create a Room
							<ArrowRight className="h-4 w-4 ml-1" />
						</Link>
						<a
							href="https://github.com/dhruvkb/flop"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2 border border-border text-foreground px-8 py-4 text-sm font-bold uppercase tracking-widest hover:border-primary/60 transition-colors"
						>
							View Source
						</a>
					</div>
					<div className="inline-flex items-center gap-2 border border-primary/10 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-secondary">
						Create by yours truly:<span className="text-primary text-shadow-xl">Dhruv Kumar Koshta
							</span>
					</div>
				</div>
			</section>

			{/* Divider */}
			<div className="border-t border-border" />

			{/* How it works */}
			<section className="px-6 py-16 max-w-3xl mx-auto w-full">
				
				<p className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-8 text-center">
					How It Works
				</p>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border border-border">
					{[
						{
							n: "01",
							title: "Add Files",
							desc: "Drop any number of files into the room. Set expiry and access rules.",
						},
						{
							n: "02",
							title: "Encrypt & Upload",
							desc: "Files are encrypted in your browser. Only ciphertext hits our servers.",
						},
						{
							n: "03",
							title: "Share One Link",
							desc: "Recipient opens the room link, selects files, downloads & decrypts instantly.",
						},
					].map((step, i) => (
						<div
							key={step.n}
							className={`px-6 py-8 space-y-3 ${i > 0 ? "border-t sm:border-t-0 sm:border-l border-border" : ""}`}
						>
							<p className="text-3xl font-extrabold text-primary/30 tabular-nums leading-none">
								{step.n}
							</p>
							<p className="text-sm font-bold uppercase tracking-widest text-foreground">
								{step.title}
							</p>
							<p className="text-xs text-muted-foreground leading-relaxed">
								{step.desc}
							</p>
						</div>
					))}
				</div>
			</section>

			{/* Divider */}
			<div className="border-t border-border" />

			{/* Feature grid */}
			<section className="px-6 py-16 max-w-3xl mx-auto w-full">
				<p className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-8 text-center">
					Built Different
				</p>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 border border-border">
					{FEATURES.map((feat, i) => {
						const Icon = feat.icon;
						const isLastOdd =
							FEATURES.length % 3 !== 0 && i === FEATURES.length - 1;
						return (
							<div
								key={feat.title}
								className={`px-5 py-6 space-y-2 border-border ${i % 3 !== 0 ? "sm:border-l" : ""} ${i >= 3 ? "border-t" : ""} ${isLastOdd ? "sm:col-span-2 lg:col-span-1" : ""}`}
							>
								<Icon className="h-5 w-5 text-primary mb-3" />
								<p className="text-xs font-bold uppercase tracking-widest text-foreground">
									{feat.title}
								</p>
								<p className="text-xs text-muted-foreground leading-relaxed">
									{feat.desc}
								</p>
							</div>
						);
					})}
				</div>
			</section>

			{/* Divider */}
			<div className="border-t border-border" />

			{/* Footer */}
			<footer className="px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
				<span className="font-bold uppercase tracking-widest text-foreground">
					flop
				</span>
				<span>No cookies. No accounts. No logs.</span>
				<div className="flex items-center gap-4">
					<a
						href="https://www.buymeacoffee.com"
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline uppercase tracking-wide font-medium"
					>
						Buy me a coffee &rarr;
					</a>
					<Link
						to="/send"
						className="text-primary hover:underline uppercase tracking-wide font-medium"
					>
						Send Files &rarr;
					</Link>
				</div>
			</footer>
		</div>
	);
}
