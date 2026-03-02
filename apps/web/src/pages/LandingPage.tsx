import {
	ArrowRight,
	Clock,
	Eye,
	Lock,
	Send,
	Shield,
	User,
	Zap,
} from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import Blocks from "@/components/ui/blocks";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import CharacterCursor from "@/components/ui/CharacterCursor";

// Hoisted to module scope so references are stable across renders.
// Inline literals here would create new array/Set objects every render,
// causing CharacterCursor and Blocks to tear down and rebuild entirely.
const CURSOR_CHARACTERS = ['f', 'l', 'o', 'p', '✦', '⊕', '⟡'];
const CURSOR_COLORS = ['#6622CC', '#A755C2', '#B07C9E', '#D2A1B8', '#B59194'];
const CURSOR_FONT = "bold 14px monospace";

const HERO_ACTIVE_DIVS: Record<number, Set<number>> = {
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
};


const FEATURES = [
	{
		icon: Lock,
		title: "AES-GCM-256",
		desc: "Every file encrypted in-browser before it ever leaves your machine.",
	},
	{
		icon: Eye,
		title: "Zero Knowledge",
		desc: "The server stores only ciphertext. Your keys never touch our servers.",
	},
	{
		icon: Clock,
		title: "Auto-Expiry",
		desc: "Rooms self-destruct in 24h, 7d, or 30d. No manual cleanup needed.",
	},
	{
		icon: Shield,
		title: "Password Protected",
		desc: "Personal rooms are owner-gated. Only you can upload or delete files.",
	},
	{
		icon: Send,
		title: "P2P First",
		desc: "Send transfers attempt WebRTC peer-to-peer before falling back to S3.",
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
		<>
		<CharacterCursor
			characters={CURSOR_CHARACTERS}
			colors={CURSOR_COLORS}
			font={CURSOR_FONT}
		/>
		<div className="min-h-screen bg-background text-foreground flex flex-col">
			{/* Nav */}
			<header className="border-b border-border px-6 py-4 flex items-center justify-between">
				<span className="text-xl font-bold tracking-widest uppercase">
					flop
				</span>
			<div className="flex items-center gap-2">
				<Link
					to="/personal"
					className="flex items-center gap-2 border border-border text-foreground px-4 py-2 text-xs font-bold uppercase tracking-widest hover:border-primary/60 transition-colors"
				>
					<User className="h-3.5 w-3.5" />
					Personal Room
				</Link>
				<Link
					to="/send"
					className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
				>
					Send Files
					<ArrowRight className="h-3.5 w-3.5" />
				</Link>
				<ThemeToggle />
			</div>
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
				activeDivs={HERO_ACTIVE_DIVS}
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
						Encrypted in your browser with AES-GCM-256. Two modes: a
						persistent personal room at your own alias, or an ephemeral
						peer-to-peer send with zero server-side keys.
					</p>

					{/* CTA */}
					<div className="flex flex-col sm:flex-row items-center justify-center gap-3">
						<Link
							to="/personal"
							className="flex items-center gap-2 bg-primary text-primary-foreground px-8 py-4 text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
						>
							<User className="h-4 w-4" />
							Create Personal Room
							<ArrowRight className="h-4 w-4 ml-1" />
						</Link>
						<Link
							to="/send"
							className="flex items-center gap-2 border border-border text-foreground px-8 py-4 text-sm font-bold uppercase tracking-widest hover:border-primary/60 transition-colors"
						>
							<Send className="h-4 w-4" />
							One-Shot Send
						</Link>
					</div>
					<div className="inline-flex items-center gap-2 border border-primary/10 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-secondary">
						Created by yours truly:
						<span className="text-primary">Dhruv Kumar Koshta</span>
					</div>
				</div>
			</section>

			{/* Divider */}
			<div className="border-t border-border" />

			{/* Two modes */}
			<section className="px-6 py-16 max-w-3xl mx-auto w-full">
				<p className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-8 text-center">
					Two Ways to Share
				</p>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border border-border">
					<div className="px-6 py-8 space-y-3">
						<User className="h-5 w-5 text-primary mb-3" />
						<p className="text-sm font-bold uppercase tracking-widest text-foreground">
							Personal Room
						</p>
						<p className="text-xs text-muted-foreground leading-relaxed">
							Claim a permanent alias (e.g. <code className="text-primary">/u/dhruv</code>).
							Password-protected uploads. Anyone with the link can download.
							Files encrypted with AES-GCM-256, keys stored server-side.
						</p>
						<Link
							to="/personal"
							className="inline-flex items-center gap-1.5 text-xs text-primary uppercase tracking-wide font-medium hover:underline mt-2"
						>
							Create yours <ArrowRight className="h-3 w-3" />
						</Link>
					</div>
					<div className="px-6 py-8 space-y-3 border-t sm:border-t-0 sm:border-l border-border">
						<Send className="h-5 w-5 text-primary mb-3" />
						<p className="text-sm font-bold uppercase tracking-widest text-foreground">
							One-Shot Send
						</p>
						<p className="text-xs text-muted-foreground leading-relaxed">
							Encrypt a file, upload to S3, share a link. The decryption key
							lives only in the URL fragment — the server never sees it. Receiver
							gets the file via WebRTC P2P or S3 fallback.
						</p>
						<Link
							to="/send"
							className="inline-flex items-center gap-1.5 text-xs text-primary uppercase tracking-wide font-medium hover:underline mt-2"
						>
							Send a file <ArrowRight className="h-3 w-3" />
						</Link>
					</div>
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
					<Link
						to="/personal"
						className="text-primary hover:underline uppercase tracking-wide font-medium"
					>
						Personal Room &rarr;
					</Link>
					<Link
						to="/send"
						className="text-primary hover:underline uppercase tracking-wide font-medium"
					>
						Send Files &rarr;
					</Link>
				</div>
			</footer>
		</div>
		</>
	);
}
