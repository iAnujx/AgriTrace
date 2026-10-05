import { useNavigate as useTsNavigate, useLocation as useTsLocation } from "@tanstack/react-router";
import { useCallback } from "react";

/** Small adapter so the original pages can keep calling navigate("/path"). */
export function useNavigate() {
  const nav = useTsNavigate();
  return useCallback(
    (to: string | number) => {
      if (typeof to === "number") {
        window.history.go(to);
        return;
      }
      void nav({ to: to as never });
    },
    [nav],
  );
}

export function useLocation() {
  return useTsLocation();
}
