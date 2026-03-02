import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
	return (
		<DialogPrimitive.Overlay
			className={cn(
				"fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
				className,
			)}
			{...props}
		/>
	);
}

export function DialogContent({
	className,
	children,
	...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
	return (
		<DialogPrimitive.Portal>
			<DialogOverlay />
			<DialogPrimitive.Content
				className={cn(
					"fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-md bg-background border border-border p-0 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
					className,
				)}
				{...props}
			>
				{children}
				<DialogPrimitive.Close className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors">
					<X className="h-4 w-4" />
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
}

export function DialogHeader({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("px-6 pt-6 pb-4 border-b border-border", className)}
			{...props}
		/>
	);
}

export function DialogTitle({
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			className={cn(
				"text-sm font-bold uppercase tracking-widest text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function DialogDescription({
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			className={cn("text-xs text-muted-foreground mt-1", className)}
			{...props}
		/>
	);
}
