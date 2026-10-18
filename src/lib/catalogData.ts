type PageResult<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

// Advance by the returned count: deployments may cap responses below our limit.
export async function fetchAllRows<T>(
  page: (first: number, last: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error, count } = await page(rows.length, rows.length + 499);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
    if (count != null && rows.length >= count) return rows;
  }
}

export async function fetchRowsForIds<T>(
  ids: string[],
  page: (ids: string[], first: number, last: number) => PromiseLike<PageResult<T>>,
) {
  const rows: T[] = [];
  const uniqueIds = [...new Set(ids)];
  // Keep URLs and concurrent requests bounded even for large catalogs.
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const batch = uniqueIds.slice(start, start + 100);
    rows.push(...await fetchAllRows((first, last) => page(batch, first, last)));
  }
  return rows;
}

export function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}
