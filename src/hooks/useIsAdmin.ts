import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkIsAdmin } from "@/lib/admin.functions";

export function useIsAdmin() {
  const fn = useServerFn(checkIsAdmin);
  const { data } = useQuery({
    queryKey: ["isAdmin"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
  return data?.isAdmin ?? false;
}
