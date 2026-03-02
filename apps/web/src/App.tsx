import { Route, Routes } from "react-router-dom";
import { LandingPage } from "@/pages/LandingPage";
import { RoomDownloadPage } from "@/pages/RoomDownloadPage";
import { RoomUploadPage } from "@/pages/RoomUploadPage";

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
	return (
		<Routes>
			<Route path="/" element={<LandingPage />} />
			<Route path="/send" element={<RoomUploadPage />} />
			<Route path="/r/:roomId" element={<RoomDownloadPage />} />
			<Route path="*" element={<NotFound />} />
		</Routes>
	);
}
