import {
	AlertTriangle,
	ArrowRight,
	Check,
	Clock,
	Eye,
	EyeOff,
	Loader2,
	Shield,
	User,
} from "lucide-react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePersonalRoomCreate } from "@/hooks/usePersonalRoom";
import { cn } from "@/lib/utils";

const EXPIRY_OPTIONS: { value: 24 | 168 | 720; label: string }[] = [
	{ value: 24, label: "24h" },
	{ value: 168, label: "7d" },
	{ value: 720, label: "30d" },
];

export function PersonalRoomCreatePage() {
	const navigate = useNavigate();
	const { phase, result, error, create } = usePersonalRoomCreate();

	const [alias, setAlias] = useState("");
	const [label, setLabel] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [expiresIn, setExpiresIn] = useState<24 | 168 | 720>(168);
	const [validationError, setValidationError] = useState<string | null>(null);

	const aliasId = useId();
	const labelId = useId();
	const passwordId = useId();
	const confirmPasswordId = useId();

	const isCreating = phase === "creating";
	const isDone = phase === "done";

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

	if (isDone && result) {
		return (
			<div className="min-h-screen bg-background flex flex-col">
				<header className="border-b border-border px-6 py-4 flex items-center justify-between">
					<Link
						to="/"
						className="text-xl font-bold tracking-widest text-foreground uppercase"
					>
						flop
					</Link>
					<div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider">
						<Shield className="h-3 w-3" />
						AES-GCM-256
					</div>
				</header>
				<main className="flex-1 flex flex-col items-center justify-center p-6">
					<div className="w-full max-w-md space-y-0">
						<div className="border border-border bg-card px-6 py-5 border-b-0">
							<div className="flex items-center gap-3">
								<Check className="h-5 w-5 text-secondary shrink-0" />
								<div>
									<h1 className="text-base font-bold uppercase tracking-widest text-foreground">
										Room Created
									</h1>
									<p className="text-xs text-muted-foreground mt-0.5">
										Your personal room is live at{" "}
										<span className="text-primary font-mono">
											/u/{result.alias}
										</span>
									</p>
								</div>
							</div>
						</div>

						<div className="border border-border border-t-0 bg-card px-5 py-4 space-y-3">
							<p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
								Room URL
							</p>
							<div className="flex gap-2">
								<input
									readOnly
									value={`${window.location.origin}/u/${result.alias}`}
									onFocus={(e) => e.target.select()}
									className="flex-1 bg-background border border-input text-xs text-foreground font-mono px-3 py-2 outline-none select-all"
								/>
								<button
									type="button"
									onClick={() =>
										navigator.clipboard.writeText(
											`${window.location.origin}/u/${result.alias}`,
										)
									}
									className="border border-border bg-card px-3 py-2 hover:border-primary/60 transition-colors text-muted-foreground hover:text-foreground text-xs uppercase tracking-wide"
								>
									Copy
								</button>
							</div>
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<Clock className="h-3 w-3 shrink-0" />
								<span>
									Expires{" "}
									{new Date(result.expiresAt).toLocaleDateString(undefined, {
										dateStyle: "long",
									})}
								</span>
							</div>
						</div>

						<div className="border border-border border-t-0 bg-card px-5 py-4 space-y-2">
							<button
								type="button"
								onClick={() => navigate(`/u/${result.alias}`)}
								className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-3 text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors"
							>
								Go to Room
								<ArrowRight className="h-4 w-4" />
							</button>
						</div>
					</div>
				</main>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background flex flex-col">
			<header className="border-b border-border px-6 py-4 flex items-center justify-between">
				<Link
					to="/"
					className="text-xl font-bold tracking-widest text-foreground uppercase"
				>
					flop
				</Link>
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider">
					<Shield className="h-3 w-3" />
					AES-GCM-256
				</div>
			</header>

			<main className="flex-1 flex flex-col items-center justify-center p-6">
				<div className="w-full max-w-md space-y-0">
					{/* Title block */}
					<div className="border border-border bg-card px-6 py-5 border-b-0">
						<div className="flex items-center gap-3">
							<User className="h-5 w-5 text-primary shrink-0" />
							<div>
								<h1 className="text-base font-bold uppercase tracking-widest text-foreground">
									Create Personal Room
								</h1>
								<p className="text-xs text-muted-foreground mt-0.5">
									Claim a permanent alias — yours at{" "}
									<span className="font-mono text-primary">/u/alias</span>
								</p>
							</div>
						</div>
					</div>

					{/* Form */}
					<div className="border border-border border-t-0 bg-card px-5 py-5 space-y-5">
						{/* Alias */}
						<div className="space-y-1.5">
							<label htmlFor={aliasId} className="text-xs text-muted-foreground uppercase tracking-wide block">
								Alias{" "}
								<span className="text-destructive">*</span>
							</label>
							<div className="flex items-center border border-input focus-within:border-primary transition-colors bg-background">
								<span className="px-3 py-2 text-xs text-muted-foreground border-r border-input bg-muted/30 font-mono">
									flop.app/u/
								</span>
								<input
									id={aliasId}
									type="text"
									maxLength={32}
									placeholder="your-name"
									value={alias}
									onChange={(e) => setAlias(e.target.value.toLowerCase())}
									disabled={isCreating}
									className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none font-mono"
								/>
							</div>
							<p className="text-xs text-muted-foreground">
								Lowercase letters, numbers, hyphens only
							</p>
						</div>

						{/* Label */}
						<div className="space-y-1.5">
							<label htmlFor={labelId} className="text-xs text-muted-foreground uppercase tracking-wide block">
								Display Label{" "}
								<span className="text-muted-foreground/50">(optional)</span>
							</label>
							<input
								id={labelId}
								type="text"
								maxLength={80}
								placeholder="e.g. Design Assets"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								disabled={isCreating}
								className="w-full bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none focus:border-primary transition-colors"
							/>
						</div>

						{/* Password */}
						<div className="space-y-1.5">
							<label htmlFor={passwordId} className="text-xs text-muted-foreground uppercase tracking-wide block">
								Password{" "}
								<span className="text-destructive">*</span>
							</label>
							<div className="flex items-center border border-input focus-within:border-primary transition-colors bg-background">
								<input
									id={passwordId}
									type={showPassword ? "text" : "password"}
									placeholder="Min 6 characters"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									disabled={isCreating}
									className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none"
								/>
								<button
									type="button"
									tabIndex={-1}
									onClick={() => setShowPassword((v) => !v)}
									className="px-3 text-muted-foreground hover:text-foreground transition-colors"
								>
									{showPassword ? (
										<EyeOff className="h-3.5 w-3.5" />
									) : (
										<Eye className="h-3.5 w-3.5" />
									)}
								</button>
							</div>
						</div>

						{/* Confirm password */}
						<div className="space-y-1.5">
							<label htmlFor={confirmPasswordId} className="text-xs text-muted-foreground uppercase tracking-wide block">
								Confirm Password{" "}
								<span className="text-destructive">*</span>
							</label>
							<input
								id={confirmPasswordId}
								type={showPassword ? "text" : "password"}
								placeholder="Repeat password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								disabled={isCreating}
								className="w-full bg-background border border-input text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none focus:border-primary transition-colors"
							/>
						</div>

						{/* Expiry */}
						<div className="space-y-1.5">
							<p className="text-xs text-muted-foreground uppercase tracking-wide">
								Expires in
							</p>
							<div className="flex gap-2">
								{EXPIRY_OPTIONS.map((opt) => (
									<button
										key={opt.value}
										type="button"
										disabled={isCreating}
										onClick={() => setExpiresIn(opt.value)}
										className={cn(
											"px-4 py-2 text-xs border uppercase tracking-wide transition-colors",
											expiresIn === opt.value
												? "border-primary bg-primary text-primary-foreground"
												: "border-border text-muted-foreground hover:border-primary/60",
										)}
									>
										{opt.label}
									</button>
								))}
							</div>
						</div>
					</div>

					{/* Errors */}
					{(validationError ?? error) && (
						<div className="border border-destructive border-t-0 bg-destructive/5 px-4 py-3 flex items-center gap-2">
							<AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
							<p className="text-xs text-destructive">{validationError ?? error}</p>
						</div>
					)}

					{/* Submit */}
					<div className="border border-border border-t-0 bg-card px-5 py-4">
						<button
							type="button"
							disabled={isCreating}
							onClick={handleSubmit}
							className={cn(
								"w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-widest transition-colors",
								isCreating
									? "bg-muted text-muted-foreground cursor-not-allowed"
									: "bg-primary text-primary-foreground hover:bg-primary/90",
							)}
						>
							{isCreating ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									Creating...
								</>
							) : (
								<>
									<User className="h-4 w-4" />
									Create Room
									<ArrowRight className="h-4 w-4 ml-auto" />
								</>
							)}
						</button>
					</div>

					{/* Footer note */}
					<div className="px-5 py-3 flex items-start gap-2 text-xs text-muted-foreground border border-border border-t-0 bg-muted/30">
						<Shield className="h-3 w-3 mt-0.5 shrink-0" />
						<span>
							Password is hashed client-side with SHA-256 before being sent.
							Only the hash is stored. Files are encrypted with AES-GCM-256.
						</span>
					</div>
				</div>
			</main>
		</div>
	);
}
