/**
 * Adds two numbers together.
 * @param {number} a - The first number.
 * @param {number} b - The second number.
 * @return {number} The sum of the two numbers.
 */
export function add(a, b) {
  return a + b;
}

if (process.argv[1].endsWith('add.js')) {
  const a = parseFloat(process.argv[2]);
  const b = parseFloat(process.argv[3]);

  if (isNaN(a) || isNaN(b)) {
    console.log('Usage: node scripts/add.js <number1> <number2>');
    process.exit(1);
  }

  console.log(add(a, b));
}
