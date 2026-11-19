export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  line: string;
  oldNum?: number;
  newNum?: number;
}

/**
 * Memory-efficient Myers-inspired line-by-line diff with common prefix/suffix
 * trimming so large files don't allocate massive O(M*N) DP tables.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const prefix: DiffLine[] = [];
  for (let i = 0; i < start; i++) {
    prefix.push({ type: 'same', line: a[i], oldNum: i + 1, newNum: i + 1 });
  }

  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);
  const m = midA.length;
  const n = midB.length;

  const middle: DiffLine[] = [];

  // If the changed middle slice is huge (> 2,500 lines each), use fast O(N) linear fallback
  if (m * n > 4_000_000) {
    for (let i = 0; i < m; i++) {
      middle.push({ type: 'removed', line: midA[i], oldNum: start + i + 1 });
    }
    for (let j = 0; j < n; j++) {
      middle.push({ type: 'added', line: midB[j], newNum: start + j + 1 });
    }
  } else {
    // Myers O((M+N)*D) / compact DP on the trimmed changed region
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        middle.push({
          type: 'same',
          line: midA[i],
          oldNum: start + i + 1,
          newNum: start + j + 1,
        });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        middle.push({ type: 'removed', line: midA[i], oldNum: start + i + 1 });
        i++;
      } else {
        middle.push({ type: 'added', line: midB[j], newNum: start + j + 1 });
        j++;
      }
    }
    while (i < m) {
      middle.push({ type: 'removed', line: midA[i], oldNum: start + i + 1 });
      i++;
    }
    while (j < n) {
      middle.push({ type: 'added', line: midB[j], newNum: start + j + 1 });
      j++;
    }
  }

  const suffix: DiffLine[] = [];
  for (let k = endA + 1; k < a.length; k++) {
    const offset = k - (endA + 1);
    suffix.push({
      type: 'same',
      line: a[k],
      oldNum: k + 1,
      newNum: endB + 1 + offset + 1,
    });
  }

  return [...prefix, ...middle, ...suffix];
}
