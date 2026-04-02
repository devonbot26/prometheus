import ast
import sys

# Policy: Block modules that allows system escape or environment manipulation
BLOCKED_MODULES = {
    "os", "subprocess", "shutil", "importlib", "pickle", "socket", 
    "pty", "ctypes", "platform", "getpass", "tempfile", "requests", "urllib"
}

# Policy: Block built-in functions that can execute strings or alter state
BLOCKED_FUNCTIONS = {
    "eval", "exec", "breakpoint", "compile", "globals", "locals", 
    "__import__", "open", "input", "help"
}

def analyze_code(code):
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"Syntax Error: {e}"

    for node in ast.walk(tree):
        # 1. Block imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split('.')[0] in BLOCKED_MODULES:
                    return f"Security Violation: Import of '{alias.name}' is restricted."
        
        if isinstance(node, ast.ImportFrom):
            if node.module and node.module.split('.')[0] in BLOCKED_MODULES:
                return f"Security Violation: Import from '{node.module}' is restricted."

        # 2. Block restricted function calls
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in BLOCKED_FUNCTIONS:
                    return f"Security Violation: Use of '{node.func.id}()' is restricted."
        
        # 3. Block dunder attribute access (all lookups)
        if isinstance(node, ast.Attribute):
            if node.attr.startswith('__'):
                return f"Security Violation: Access to dunder attribute '{node.attr}' is restricted."

    return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 python-guard.py <file_to_check>")
        sys.exit(1)

    file_path = sys.argv[1]
    try:
        with open(file_path, 'r') as f:
            user_code = f.read()
        
        error = analyze_code(user_code)
        if error:
            print(error)
            sys.exit(1)
        else:
            # Success - code is clean
            sys.exit(0)
    except Exception as e:
        print(f"Analysis Failed: {e}")
        sys.exit(1)
