# Check if volta is installed in the environment
VOLTA=$(which volta)

# Set cwd to the directory of this script
cd "$(dirname "$0")"

# Append .test.ts to avoid vitest substring-matching unrelated test files
if [ -n "$1" ]; then
  TEST_FILTER="$1.test.ts"
else
  TEST_FILTER=""
fi

# Run the tests with volta if it is installed
if [ -x "$VOLTA" ]; then
  echo "Running tests with volta"
  volta run yarn test $TEST_FILTER
# Otherwise, run the tests without volta
else
  echo "Running tests without volta"
  yarn test $TEST_FILTER
fi
