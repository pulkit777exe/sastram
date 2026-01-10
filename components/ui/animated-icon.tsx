import { motion, HTMLMotionProps } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnimatedIconProps extends Omit<HTMLMotionProps<"span">, "children"> {
  icon: LucideIcon;
  animateOnHover?: boolean | string;
  animateOnTap?: boolean | string;
  animateOnView?: boolean | string;
  animateOnViewMargin?: string;
  animateOnViewOnce?: boolean;
  className?: string;
  size?: number;
}

const defaultAnimations = {
  hover: {
    scale: 1.1,
    rotate: 5,
    transition: { duration: 0.2 }
  },
  tap: {
    scale: 0.95,
    transition: { duration: 0.1 }
  },
  view: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 }
  }
};

export function AnimatedIcon({
  icon: Icon,
  animateOnHover,
  animateOnTap,
  animateOnView,
  animateOnViewMargin = "0px",
  animateOnViewOnce = true,
  className,
  size = 16,
  ...props
}: AnimatedIconProps) {
  const variants: Record<string, any> = {};
  if (animateOnHover) {
    variants.hover = typeof animateOnHover === 'string' ? { [animateOnHover]: true } : defaultAnimations.hover;
  }
  if (animateOnTap) {
    variants.tap = typeof animateOnTap === 'string' ? { [animateOnTap]: true } : defaultAnimations.tap;
  }

  const motionProps: HTMLMotionProps<"span"> = {
    whileHover: animateOnHover ? "hover" : undefined,
    whileTap: animateOnTap ? "tap" : undefined,
    variants,
    className: cn("inline-block", className),
    ...props
  };

  if (animateOnView) {
    motionProps.initial = "initial";
    motionProps.animate = "animate";
    motionProps.viewport = { once: animateOnViewOnce, margin: animateOnViewMargin };
    motionProps.variants = { ...motionProps.variants, ...defaultAnimations.view };
  }

  return (
    <motion.span {...motionProps}>
      <Icon size={size} />
    </motion.span>
  );
}