import React, { type JSX, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function Blocks({
	activeDivs,
	divClass,
	classname,
	activeDivsClass,
	containerRef,
}: {
	activeDivsClass?: string;
	activeDivs?: Record<number, Set<number>>;
	divClass?: string;
	classname?: string;
	containerRef: React.RefObject<HTMLDivElement | null>;
}) {
	const [blocks, setBlocks] = useState<JSX.Element[]>([]);

	useEffect(() => {
		const updateBlocks = () => {
			const container = containerRef.current;
			if (container) {
				const containerWidth = container.clientWidth;
				const containerHeight = container.clientHeight;
				const blockSize = containerWidth * 0.06;

				const columns = Math.floor(containerWidth / blockSize);
				const rows = Math.floor(containerHeight / blockSize);

				const newBlocks = Array.from({ length: columns }, (_, columnIndex) => {
					const colKey = `col-${columnIndex}`;
					const rows2 = Array.from({ length: rows }, (_, rowIndex) => {
						const cellKey = `${columnIndex}-${rowIndex}`;
						return (
							<div
								key={cellKey}
								className={cn(
									`h-[6vh] w-full border border-[#5dcece09] ${
										activeDivs?.[columnIndex]?.has(rowIndex)
											? `${activeDivsClass}`
											: ""
									}`,
									divClass,
								)}
								style={{ height: `${blockSize}px` }}
							/>
						);
					});
					return (
						<div key={colKey} className="w-[6vw] h-full">
							{rows2}
						</div>
					);
				});

				setBlocks(newBlocks);
			}
		};

		updateBlocks();
		window.addEventListener("resize", updateBlocks);

		return () => window.removeEventListener("resize", updateBlocks);
	}, [activeDivs, activeDivsClass, divClass, containerRef]);

	return (
		<div
			className={cn(
				"flex h-full overflow-hidden top-0 -inset-0 left-0 absolute",
				classname,
			)}
		>
			{blocks}
		</div>
	);
}

export default Blocks;
