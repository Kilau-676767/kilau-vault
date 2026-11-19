export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  line: string;
  oldNum?: number;
  newNum?: number;
}

/**
 * LCS-based line-by-line diff between oldText (historical revision) and newText (current note).
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const m = a.length;
  const n = b.length;

  // DP table for Longest Common Subsequence
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', line: a[i], oldNum: i + 1, newNum: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', line: a[i], oldNum: i + 1 });
      i++;
    } else {
      result.push({ type: 'added', line: b[j], newNum: j + 1 });
      j++;
    }
  }
  while (i < m) {
    result.push({ type: 'removed', line: a[i], oldNum: i + 1 });
    i++;
  }
  while (j < n) {
    result.push({ type: 'added', line: b[j], newNum: j + 1 });
    j++;
  }

  return result;
}
