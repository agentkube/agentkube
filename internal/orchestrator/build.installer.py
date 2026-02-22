# build.py
import os
import platform
import subprocess
import shutil
import tempfile

def build_executable():
    """Build executable for the FastAPI server using PyInstaller"""
    print("Starting build process...")
    
    # Determine the operating system
    system = platform.system()
    print(f"Building for {system} platform")
    
    # Clean previous builds
    if os.path.exists("dist"):
        shutil.rmtree("dist")
    if os.path.exists("build"):
        shutil.rmtree("build")
    if os.path.exists("fastapi_server.spec"):
        os.remove("fastapi_server.spec")
    
    # Make sure workflow directory has __init__.py
    workflow_init = os.path.join("workflow", "__init__.py")
    if not os.path.exists(workflow_init):
        with open(workflow_init, "w") as f:
            pass  # Create an empty __init__.py file
    
    # Create a temporary directory for a modified version of the source
    with tempfile.TemporaryDirectory() as tmpdir:
        # Copy all Python files from current directory to temp directory
        for root, dirs, files in os.walk("."):
            if ".venv" in root or "__pycache__" in root or "build" in root or "dist" in root:
                continue
                
            for file in files:
                if file.endswith(".py") or file == "README.md":
                    src_path = os.path.join(root, file)
                    rel_path = os.path.relpath(src_path, ".")
                    dst_path = os.path.join(tmpdir, rel_path)
                    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
                    shutil.copy2(src_path, dst_path)
        
        # Modify workflow module name to avoid conflict with PyInstaller hook
        # Rename folder
        os.rename(os.path.join(tmpdir, "workflow"), os.path.join(tmpdir, "workflow_local"))
        
        # Update imports in all Python files
        for root, dirs, files in os.walk(tmpdir):
            for file in files:
                if file.endswith(".py"):
                    file_path = os.path.join(root, file)
                    with open(file_path, 'r') as f:
                        content = f.read()
                    
                    # Replace imports of workflow with workflow_local
                    content = content.replace("from workflow.", "from workflow_local.")
                    content = content.replace("import workflow.", "import workflow_local.")
                    content = content.replace("from workflow import", "from workflow_local import")
                    content = content.replace("import workflow", "import workflow_local")
                    
                    with open(file_path, 'w') as f:
                        f.write(content)
        
        # Create a custom spec file
        spec_content = """# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('README.md', '.')],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.protocols',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'fastapi',
        'workflow_local',
        'workflow_local.workflow',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='fastapi_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
"""
        
        spec_path = os.path.join(tmpdir, "fastapi_server.spec")
        with open(spec_path, 'w') as f:
            f.write(spec_content)
        
        # Run PyInstaller in the temporary directory
        cmd = ["pyinstaller", "fastapi_server.spec"]
        
        try:
            subprocess.run(cmd, check=True, cwd=tmpdir)
            print(f"Build completed successfully in temporary directory.")
            
            # Copy the executable back to the original directory
            os.makedirs("dist", exist_ok=True)
            shutil.copy2(
                os.path.join(tmpdir, "dist", "fastapi_server" + (".exe" if system == "Windows" else "")), 
                os.path.join("dist", "fastapi_server" + (".exe" if system == "Windows" else ""))
            )
            print(f"Executable copied to dist folder.")
            
        except subprocess.CalledProcessError as e:
            print(f"Build failed with error: {e}")
        except Exception as e:
            print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    # Create a simple README file if it doesn't exist
    if not os.path.exists("README.md"):
        with open("README.md", "w") as f:
            f.write("# FastAPI Server\n\nA simple async REST API built with FastAPI.")
    
    # Build the executable
    build_executable()