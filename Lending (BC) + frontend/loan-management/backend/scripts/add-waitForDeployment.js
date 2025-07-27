const fs = require('fs');
const path = require('path');

// Function to process each test file
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Regex to find expect().to.equal(number) patterns
  const regex = /expect\((.*?)\)\.to\.equal\((\d+)\)/g;
  
  // Replace with expect().to.equal(numbern)
  const newContent = content.replace(regex, (match, p1, p2) => {
    return `expect(${p1}).to.equal(${p2}n)`;
  });
  
  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Updated ${path.basename(filePath)}`);
    return true;
  }
  return false;
}

// Main function to process all test files
function main() {
  const testDir = path.join(__dirname, '../test');
  
  if (!fs.existsSync(testDir)) {
    console.error('Test directory not found!');
    process.exit(1);
  }

  const testFiles = fs.readdirSync(testDir)
    .filter(file => file.endsWith('.test.js'));
  
  let updatedCount = 0;
  
  testFiles.forEach(file => {
    const fullPath = path.join(testDir, file);
    if (processFile(fullPath)) {
      updatedCount++;
    }
  });
  
  console.log(`\nDone! Updated ${updatedCount} files.`);
}

main();