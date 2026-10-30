import {
	AlertTriangle,
	ArrowRight,
	Check,
	CheckCircle2,
	Clock,
	Copy,
	Eye,
	EyeOff,
	HelpCircle,
	Key,
	Lightbulb,
	Loader2,
	QrCode,
	Shield,
	ShieldCheck,
	Sparkles,
	User,
} from "lucide-react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import QRCode from "react-qr-code";
import { motion, AnimatePresence } from "framer-motion";
import { usePersonalRoomCreate } from "@/hooks/usePersonalRoom";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { UiTipBanner, UiTipsDrawer, UiTipTooltip } from "@/components/ui/UiTips";

const EXPIRY_OPTIONS: { value: 24 | 168 | 720 | 1440; label: string; desc: string }[] = [
	{ value: 24, label: "24h", desc: "1 day" },
	{ value: 168, label: "7d", desc: "1 week" },
	{ value: 720, label: "30d", desc: "1 month" },
	{ value: 1440, label: "60d", desc: "2 months" },
];

const ROOM_TIPS = [
	{
		id: "alias-tip",
		title: "Custom Room Handle",
		description: "Your room alias is permanent for the duration set. Anyone with your room link and password can send files to you.",
		tag: "URL Handle",
		icon: <User className="h-3.5 w-3.5" />,
	},
	{
		id: "security-tip",
		title: "Zero-Knowledge Encryption",
		description: "Passwords are hashed with SHA-256 client-side. The server never stores or sees raw passwords.",
		tag: "AES-256",
		icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />,
	},
	{
		id: "expiry-tip",
		title: "Automatic Expiry",
		description: "Rooms and stored files are automatically purged after the selected expiration window.",
		tag: "Auto-Purge",
		icon: <Clock className="h-3.5 w-3.5 text-amber-500" />,
	},
];

function calculatePasswordStrength(pass: string) {
	if (!pass) return { score: 0, label: "", color: "bg-muted" };
	let score = 0;
	if (pass.length >= 6) score += 1;
	if (pass.length >= 10) score += 1;
	if (/[A-Z]/.test(pass)) score += 1;
	if (/[0-9]/.test(pass)) score += 1;
	if (/[^A-Za-z0-9]/.test(pass)) score += 1;

	if (score <= 1) return { score: 1, label: "Weak", color: "bg-destructive" };
	if (score <= 3) return { score: 2, label: "Fair", color: "bg-amber-500" };
	return { score: 3, label: "Strong", color: "bg-emerald-500" };
}

export function PersonalRoomCreatePage() {
	const navigate = useNavigate();
	const { phase, result, error, create } = usePersonalRoomCreate();

	const [alias, setAlias] = useState("");
	const [label, setLabel] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [expiresIn, setExpiresIn] = useState<24 | 168 | 720 | 1440>(168);
	const [validationError, setValidationError] = useState<string | null>(null);
	const [showQr, setShowQr] = useState(false);
	const [copied, setCopied] = useState(false);

	const aliasId = useId();
	const labelId = useId();
	const passwordId = useId();
	const confirmPasswordId = useId();

	const isCreating = phase === "creating";
	const isDone = phase === "done";

	const passStrength = calculatePasswordStrength(password);
	const isAliasValid = alias.length >= 2 && /^[a-z0-9-]+$/.test(alias);

	const handleSubmit = async () => {
		setValidationError(null);

		if (!alias.trim()) {
			setValidationError("Alias is required");
			return;
		}
		if (!/^[a-z0-9-]+$/.test(alias)) {
			setValidationError(
				"Alias must be lowercase letters, numbers, or hyphens",
			);
			return;
		}
		if (alias.length < 2 || alias.length > 32) {
			setValidationError("Alias must be 2–32 characters");
			return;
		}
		if (!password) {
			setValidationError("Password is required");
			return;
		}
		if (password.length < 6) {
			setValidationError("Password must be at least 6 characters");
			return;
		}
		if (password !== confirmPassword) {
			setValidationError("Passwords do not match");
			return;
		}

		await create({ alias, label: label.trim() || undefined, password, expiresIn });
	};

	const copyLink = async (url: string) => {
		await navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	if (isDone && result) {
		const roomUrl = `${window.location.origin}/u/${result.alias}`;
		return (
			<div className="min-h-screen bg-background flex flex-col">
				<header className="border-b border-border px-6 py-4 flex items-center justify-between">
					<Link
						to="/"
						className="text-xl font-bold tracking-widest text-foreground uppercase flex items-center gap-2"
					>
						<span>flop</span>
						<span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
							Personal Room
						</span>
					</Link>
					<div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wider">
						<div className="flex items-center gap-1.5 text-emerald-500 font-mono">
							<Shield className="h-3.5 w-3.5" />
							AES-GCM-256
						</div>
						<ThemeToggle />
					</div>
				</header>
				<main className="flex-1 flex flex-col items-center justify-center p-6">
					<motion.div
						initial={{ opacity: 0, scale: 0.95, y: 15 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						transition={{ duration: 0.35, ease: "easeOut" }}
						className="w-full max-w-md space-y-4"
					>
						<UiTipBanner
							title="Room Created Successfully!"
							description="Your personal room is active and secured. Share the room handle or QR code with trusted peers."
							icon={<Sparkles className="h-4 w-4 text-emerald-500 shrink-0" />}
						/>

						<div className="border border-border bg-card/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-lg space-y-0">
							<div className="p-6 border-b border-border bg-muted/20 flex items-center gap-4">
								<div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
									<CheckCircle2 className="h-6 w-6" />
								</div>
								<div>
									<h1 className="text-lg font-bold uppercase tracking-wider text-foreground">
										Room Ready
									</h1>
									<p className="text-xs text-muted-foreground mt-0.5">
										Handle:{" "}
										<span className="text-primary font-mono font-semibold">
											/u/{result.alias}
										</span>
									</p>
								</div>
							</div>

							<div className="p-6 space-y-4">
								<div className="space-y-1.5">
									<label className="text-xs uppercase tracking-widest text-muted-foreground font-semibold flex items-center justify-between">
										<span>Shareable Room Link</span>
										<UiTipTooltip content="Send this URL to peers so they can upload or view files in your personal room." />
									</label>
									<div className="flex gap-2">
										<input
											readOnly
											value={roomUrl}
											onFocus={(e) => e.target.select()}
											className="flex-1 bg-background border border-input rounded-xl text-xs text-foreground font-mono px-3.5 py-2.5 outline-none select-all focus:border-primary transition-colors"
										/>
										<button
											type="button"
											onClick={() => copyLink(roomUrl)}
											className="border border-border bg-card px-4 py-2.5 rounded-xl hover:border-primary/60 transition-all text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 shrink-0"
										>
											{copied ? (
												<>
													<Check className="h-3.5 w-3.5 text-emerald-500" />
													<span className="text-emerald-500">Copied</span>
												</>
											) : (
												<>
													<Copy className="h-3.5 w-3.5" />
													Copy
												</>
											)}
										</button>
									</div>
								</div>

								<div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50 text-xs">
									<div className="flex items-center gap-2 text-muted-foreground">
										<Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
										<span>Valid until</span>
									</div>
									<span className="font-mono text-foreground font-medium">
										{new Date(result.expiresAt).toLocaleDateString(undefined, {
											dateStyle: "medium",
											timeStyle: "short",
										})}
									</span>
								</div>

								<button
									type="button"
									onClick={() => setShowQr((v) => !v)}
									className="flex items-center justify-center gap-2 border border-border bg-muted/10 hover:bg-muted/30 px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider text-foreground transition-all w-full font-semibold"
								>
									<QrCode className="h-4 w-4 shrink-0 text-primary" />
									{showQr ? "Hide QR Code" : "Show Room QR Code"}
								</button>

								<AnimatePresence>
									{showQr && (
										<motion.div
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											exit={{ opacity: 0, height: 0 }}
											className="overflow-hidden border border-border rounded-xl p-5 bg-card flex flex-col items-center gap-3"
										>
											<div className="bg-white p-3.5 rounded-xl shadow-inner inline-block border border-border">
												<QRCode
													value={roomUrl}
													size={160}
													bgColor="#ffffff"
													fgColor="#000000"
												/>
											</div>
											<p className="text-[11px] text-muted-foreground text-center">
												Scan with mobile camera to jump directly to this room
											</p>
										</motion.div>
									)}
								</AnimatePresence>

								<button
									type="button"
									onClick={() => navigate(`/u/${result.alias}`)}
									className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-primary/90 transition-all shadow-md active:scale-[0.99]"
								>
									<span>Enter Room Now</span>
									<ArrowRight className="h-4 w-4" />
								</button>
							</div>
						</div>
					</motion.div>
				</main>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background flex flex-col">
			<header className="border-b border-border px-6 py-4 flex items-center justify-between">
				<Link
					to="/"
					className="text-xl font-bold tracking-widest text-foreground uppercase flex items-center gap-2"
				>
					<span>flop</span>
					<span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
						Personal Room
					</span>
				</Link>
				<div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wider">
					<div className="flex items-center gap-1.5 text-emerald-500 font-mono">
						<Shield className="h-3.5 w-3.5" />
						AES-GCM-256
					</div>
					<ThemeToggle />
				</div>
			</header>

			<main className="flex-1 flex flex-col items-center justify-center p-6">
				<motion.div
					initial={{ opacity: 0, y: 15 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3 }}
					className="w-full max-w-md space-y-4"
				>
					{/* Title Card */}
					<div className="border border-border bg-card/90 backdrop-blur-md rounded-2xl overflow-hidden shadow-sm">
						<div className="p-6 border-b border-border bg-muted/20 flex items-center gap-3.5">
							<div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
								<User className="h-5 w-5" />
							</div>
							<div>
								<h1 className="text-base font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
									Create Personal Room
								</h1>
								<p className="text-xs text-muted-foreground mt-0.5">
									Claim a unique handle at{" "}
									<span className="font-mono text-primary font-medium">/u/alias</span>
								</p>
							</div>
						</div>

						{/* Form */}
						<div className="p-6 space-y-4">
							{/* Alias */}
							<div className="space-y-1.5">
								<div className="flex items-center justify-between">
									<label htmlFor={aliasId} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
										<span>Room Alias</span>
										<span className="text-destructive">*</span>
									</label>
									{alias && (
										<span className={cn(
											"text-[10px] font-mono px-2 py-0.5 rounded-md flex items-center gap-1",
											isAliasValid ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"
										)}>
											{isAliasValid ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
											{isAliasValid ? "Available Format" : "Invalid Format"}
										</span>
									)}
								</div>

								<div className="flex items-center border border-input rounded-xl focus-within:border-primary transition-all bg-background overflow-hidden">
									<span className="px-3.5 py-2.5 text-xs text-muted-foreground border-r border-input bg-muted/30 font-mono shrink-0">
										/u/
									</span>
									<input
										id={aliasId}
										type="text"
										maxLength={32}
										placeholder="your-handle"
										value={alias}
										onChange={(e) => setAlias(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
										disabled={isCreating}
										className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground px-3.5 py-2.5 outline-none font-mono"
									/>
								</div>
								<p className="text-[11px] text-muted-foreground">
									2–32 characters (lowercase letters, numbers, hyphens)
								</p>
							</div>

							{/* Label */}
							<div className="space-y-1.5">
								<label htmlFor={labelId} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
									<span>Display Label <span className="text-muted-foreground/50 font-normal">(optional)</span></span>
									<UiTipTooltip content="Optional descriptive name shown on top of the room page for visitors." />
								</label>
								<input
									id={labelId}
									type="text"
									maxLength={80}
									placeholder="e.g. Design Files & Screenshots"
									value={label}
									onChange={(e) => setLabel(e.target.value)}
									disabled={isCreating}
									className="w-full bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground px-3.5 py-2.5 outline-none focus:border-primary transition-all"
								/>
							</div>

							{/* Password & Confirm */}
							<div className="space-y-3">
								<div className="space-y-1.5">
									<div className="flex items-center justify-between">
										<label htmlFor={passwordId} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
											<span>Room Password</span>
											<span className="text-destructive">*</span>
										</label>
										{password && (
											<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
												Strength: <span className={cn(passStrength.color === "bg-emerald-500" ? "text-emerald-500" : passStrength.color === "bg-amber-500" ? "text-amber-500" : "text-destructive")}>{passStrength.label}</span>
											</span>
										)}
									</div>
									<div className="flex items-center border border-input rounded-xl focus-within:border-primary transition-all bg-background overflow-hidden">
										<input
											id={passwordId}
											type={showPassword ? "text" : "password"}
											placeholder="Minimum 6 characters"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											disabled={isCreating}
											className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground px-3.5 py-2.5 outline-none"
										/>
										<button
											type="button"
											tabIndex={-1}
											onClick={() => setShowPassword((v) => !v)}
											className="px-3.5 text-muted-foreground hover:text-foreground transition-colors"
										>
											{showPassword ? (
												<EyeOff className="h-4 w-4" />
											) : (
												<Eye className="h-4 w-4" />
											)}
										</button>
									</div>

									{/* Animated Password meter */}
									{password && (
										<div className="flex items-center gap-1.5 pt-1">
											<div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
												<motion.div
													className={cn("h-full rounded-full", passStrength.color)}
													initial={{ width: 0 }}
													animate={{ width: `${(passStrength.score / 3) * 100}%` }}
													transition={{ duration: 0.2 }}
												/>
											</div>
										</div>
									)}
								</div>

								<div className="space-y-1.5">
									<label htmlFor={confirmPasswordId} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
										Confirm Password <span className="text-destructive">*</span>
									</label>
									<input
										id={confirmPasswordId}
										type={showPassword ? "text" : "password"}
										placeholder="Repeat password"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										disabled={isCreating}
										className={cn(
											"w-full bg-background border rounded-xl text-sm text-foreground placeholder:text-muted-foreground px-3.5 py-2.5 outline-none focus:border-primary transition-all",
											confirmPassword && confirmPassword !== password ? "border-destructive focus:border-destructive" : "border-input"
										)}
									/>
									{confirmPassword && confirmPassword !== password && (
										<p className="text-[11px] text-destructive">Passwords do not match</p>
									)}
								</div>
							</div>

							{/* Expiry Selector */}
							<div className="space-y-1.5 pt-1">
								<div className="flex items-center justify-between">
									<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
										<span>Room Expiration</span>
										<UiTipTooltip content="After this period, the room and all stored files will automatically be deleted." />
									</p>
									<span className="text-[10px] text-muted-foreground font-mono">
										{EXPIRY_OPTIONS.find((o) => o.value === expiresIn)?.desc}
									</span>
								</div>
								<div className="grid grid-cols-4 gap-2">
									{EXPIRY_OPTIONS.map((opt) => (
										<button
											key={opt.value}
											type="button"
											disabled={isCreating}
											onClick={() => setExpiresIn(opt.value)}
											className={cn(
												"py-2 px-1 text-center rounded-xl text-xs font-mono font-semibold uppercase tracking-wider transition-all border",
												expiresIn === opt.value
													? "border-primary bg-primary text-primary-foreground shadow-sm"
													: "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
											)}
										>
											{opt.label}
										</button>
									))}
								</div>
							</div>
						</div>

						{/* Errors */}
						<AnimatePresence>
							{(validationError ?? error) && (
								<motion.div
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									className="border-t border-destructive/30 bg-destructive/10 px-5 py-3 flex items-center gap-2"
								>
									<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
									<p className="text-xs text-destructive font-medium">{validationError ?? error}</p>
								</motion.div>
							)}
						</AnimatePresence>

						{/* Submit */}
						<div className="p-6 pt-2">
							<button
								type="button"
								disabled={isCreating}
								onClick={handleSubmit}
								className={cn(
									"w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all shadow-md active:scale-[0.99]",
									isCreating
										? "bg-muted text-muted-foreground cursor-not-allowed"
										: "bg-primary text-primary-foreground hover:bg-primary/90",
								)}
							>
								{isCreating ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										<span>Creating Room...</span>
									</>
								) : (
									<>
										<User className="h-4 w-4" />
										<span>Create Personal Room</span>
										<ArrowRight className="h-4 w-4 ml-auto" />
									</>
								)}
							</button>
						</div>
					</div>

					{/* Expandable Tips Guide */}
					<UiTipsDrawer tips={ROOM_TIPS} title="Room Creation & Security Guide" />
				</motion.div>
			</main>
		</div>
	);
}

