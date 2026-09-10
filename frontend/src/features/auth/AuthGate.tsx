import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router";
import { Skeleton } from "antd";
import { auth } from "../../api/auth";
import { ApiError } from "../../api/client";
import { useEffect } from "react";
export function AuthGate() {
  const session = useQuery({
    queryKey: ["auth"],
    queryFn: ({ signal }) => auth.session(signal),
    retry: false,
  });
  useEffect(() => {
    if (!session.data?.authenticated) return;
    const renew = () => void auth.renew().catch(() => {});
    renew();
    const timer = setInterval(renew, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [session.dataUpdatedAt]);
  if (session.isPending) return <Skeleton active />;
  if (session.isError || !session.data?.authenticated) {
    const unauthorized =
      session.error instanceof ApiError && session.error.status === 401;
    return (
      <Navigate
        to="/login"
        replace
        state={
          session.isError && !unauthorized
            ? { sessionCheckError: session.error.message }
            : null
        }
      />
    );
  }
  return <Outlet />;
}
