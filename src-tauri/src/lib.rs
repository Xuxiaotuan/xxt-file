use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;
use std::env;

#[command]
fn get_home_directory() -> Result<String, String> {
    // 获取当前用户的主目录
    if let Ok(home_dir) = env::var("HOME") {
        Ok(home_dir)
    } else {
        Err("Failed to get home directory".to_string())
    }
}

#[derive(Serialize, Deserialize)]
struct FileInfo {
    name: String,
    path: String,
    size: u64,
    created: u64,
    is_dir: bool,
}

#[derive(Serialize, Deserialize)]
struct ListFilesResponse {
    files: Vec<FileInfo>,
    total_files: usize,
    total_folders: usize,
}

#[command]
fn list_files(directory: String, search_query: String) -> Result<ListFilesResponse, String> {
    println!("Received request to list files in directory: {}", directory);
    println!("Search query: '{}'", search_query);
    let path = Path::new(&directory);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }
    let mut files = Vec::new();
    let mut total_files = 0;
    let mut total_folders = 0;
    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(e) => return Err(format!("Failed to read directory: {}", e)),
    };
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Skipping entry due to error: {}", e);
                continue;
            }
        };
        let file_path = entry.path();
        let file_name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => {
                eprintln!("Skipping entry with invalid UTF-8 name");
                continue;
            }
        };
        // 临时注释隐藏文件过滤
        if file_name.starts_with(".") {
            continue;
        }
        if !search_query.is_empty()
            && !file_name
                .to_lowercase()
                .contains(&search_query.to_lowercase())
        {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(e) => {
                eprintln!("Skipping {} due to metadata error: {}", file_name, e);
                continue;
            }
        };
        let is_dir = metadata.is_dir();
        let size = metadata.len();
        let created = match metadata.created() {
            Ok(time) => time
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            Err(e) => {
                eprintln!("Failed to get created time for {}: {}", file_name, e);
                0
            }
        };
        files.push(FileInfo {
            name: file_name,
            path: file_path.to_string_lossy().to_string(),
            size,
            created,
            is_dir,
        });
        if is_dir {
            total_folders += 1;
        } else {
            total_files += 1;
        }
    }
    println!("Found {} files and {} folders", total_files, total_folders);
    Ok(ListFilesResponse {
        files,
        total_files,
        total_folders,
    })
}

#[command]
fn get_total_size(path: String) -> Result<u64, String> {
    let path = Path::new(&path);
    calculate_total_size(path, 3) // 限制最大深度为 3
}


fn calculate_total_size(path: &Path, depth: usize) -> Result<u64, String> {
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }

    if path.is_file() {
        return Ok(fs::metadata(path).map_err(|e| e.to_string())?.len());
    }

    if depth == 0 {
        return Ok(0); // 达到最大深度，停止递归
    }

    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    // 使用 Rayon 并行处理
    let total_size: u64 = entries
        .par_bridge() // 将迭代器转换为并行迭代器
        .map(|entry| {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                calculate_total_size(&path, depth - 1) // 递归时减少深度
            } else {
                Ok(fs::metadata(&path).map_err(|e| e.to_string())?.len())
            }
        })
        .sum::<Result<u64, String>>()?;

    Ok(total_size)
}


#[command]
fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())
}
#[command]
fn rename_file(old_path: String, new_name: String) -> Result<(), String> {
    let new_path = format!("{}/{}", Path::new(&old_path).parent().unwrap().to_str().unwrap(), new_name);
    fs::rename(old_path, new_path).map_err(|e| e.to_string())
}
#[command]
fn paste_file(source_path: String, target_path: String) -> Result<(), String> {
    let target = if Path::new(&target_path).is_dir() {
        format!("{}/{}", target_path, Path::new(&source_path).file_name().unwrap().to_str().unwrap())
    } else {
        target_path
    };
    fs::copy(source_path, target).map_err(|e| e.to_string())?;
    Ok(())
}
#[command]
fn auto_complete_path(partial_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&partial_path);
    let parent = path.parent().unwrap_or(Path::new("."));
    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let mut results = Vec::new();
    if let Ok(entries) = fs::read_dir(parent) {
        for entry in entries {
            if let Ok(entry) = entry {
                let entry_path = entry.path();
                let entry_name = entry_path.file_name().unwrap_or_default().to_string_lossy().to_string();
                // 检查文件名是否以 partial_path 的文件名部分开头
                if entry_name.starts_with(&file_name) {
                    // 构建完整路径
                    let full_path = parent.join(&entry_name).to_string_lossy().to_string();
                    results.push(full_path);
                }
            }
        }
    }
    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_home_directory,
            get_total_size,
            list_files,
            delete_file,
            rename_file,
            paste_file,
            auto_complete_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
