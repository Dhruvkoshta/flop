import { Route, Routes } from "react-router-dom";
import { LandingPage } from "@/pages/LandingPage";
import { PersonalRoomCreatePage } from "@/pages/PersonalRoomCreatePage";
import { PersonalRoomPage } from "@/pages/PersonalRoomPage";
import { SendPage } from "@/pages/SendPage";
import { ReceivePage } from "@/pages/ReceivePage";
import { useTheme } from "@/hooks/useTheme";

function NotFound() {
	return (
		<div className="min-h-screen flex items-center justify-center p-4">
			<div className="text-center space-y-3 border border-border bg-card px-8 py-10">
				<p className="text-4xl font-extrabold text-primary">404</p>
				<p className="text-muted-foreground text-xs uppercase tracking-widest">
					Page not found.
				</p>
				<a
					href="/"
					className="block text-xs text-primary hover:underline uppercase tracking-widest mt-4"
				>
					&larr; Back to flop
				</a>
			</div>
		</div>
	);
}

export default function App() {
	// Initialize theme from localStorage / system preference
	useTheme();

	return (
		<>
			<Routes>
				<Route path="/" element={<LandingPage />} />
				<Route path="/personal" element={<PersonalRoomCreatePage />} />
				<Route path="/u/:alias" element={<PersonalRoomPage />} />
				<Route path="/send" element={<SendPage />} />
				<Route path="/r/:roomId" element={<ReceivePage />} />
				<Route path="*" element={<NotFound />} />
			</Routes>
		</>
	);
}
