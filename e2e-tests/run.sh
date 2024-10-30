# Check if volta is installed in the environment
VOLTA=$(which volta)

# Set cwd to the directory of this script
cd "$(dirname "$0")"

# Run the tests with volta if it is installed
if [ -x "$VOLTA" ]; then
  echo "Running tests with volta"
  volta run yarn test $@
# Otherwise, run the tests without volta
else
  echo "Running tests without volta"
  yarn test $@
fi
