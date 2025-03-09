import {useState, useEffect, useRef} from "react";
import {invoke} from "@tauri-apps/api/core";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faFolder,
    faFile,
    faFileImage,
    faFilePdf,
    faFileWord,
    faFileExcel,
    faFilePowerpoint,
    faFileCode,
    faFileAudio,
    faFileVideo,
    faFileArchive,
} from "@fortawesome/free-solid-svg-icons";
import "./App.css";

// 定义文件信息接口
interface FileInfo {
    name: string;
    path: string;
    size: number;
    created: number;
    is_dir: boolean;
}

function App() {
    const [directory, setDirectory] = useState("");
    const [files, setFiles] = useState<FileInfo[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [totalFiles, setTotalFiles] = useState(0);
    const [totalFolders, setTotalFolders] = useState(0);
    const [queryTime, setQueryTime] = useState(0);
    const [totalSize, setTotalSize] = useState<number>(0);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [sortBy, setSortBy] = useState("date");
    const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
    const [contextMenu, setContextMenu] = useState<{
        visible: boolean;
        file: FileInfo | null;
    }>({
        visible: false,
        file: null,
    });
    const [clipboard, setClipboard] = useState<string | null>(null); // 剪贴板
    const [autoCompletePaths, setAutoCompletePaths] = useState<string[]>([]); // 自动补全路径
    const directoryInputRef = useRef<HTMLInputElement>(null);

    // 获取当前用户的路径
    useEffect(() => {
        invoke("get_home_directory")
            .then((homeDir) => {
                setDirectory(homeDir as string);
            })
            .catch((error) => {
                console.error("Failed to get home directory:", error);
            });
    }, []);

    // 监听目录变化，刷新文件列表
    useEffect(() => {
        const fetchData = async () => {
            await fetchTotalSize(directory);
            await listFiles(directory);
        };
        fetchData();
    }, [directory]);

    // 获取文件夹总大小
    const fetchTotalSize = async (dir: string) => {
        try {
            const size = await invoke<number>("get_total_size", { path: dir });
            setTotalSize(size);
        } catch (error) {
            console.error("Error calculating total size:", error);
        }
    };

    // 添加路径到历史记录
    const addToHistory = (path: string) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(path);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    // 返回上一级目录
    const handleBack = async () => {
        if (historyIndex > 0) {
            const prevPath = history[historyIndex - 1];
            setDirectory(prevPath);
            setHistoryIndex(historyIndex - 1);
            await listFiles(prevPath);
        }
    };

    // 前进到下一级目录
    const handleForward = async () => {
        if (historyIndex < history.length - 1) {
            const nextPath = history[historyIndex + 1];
            setDirectory(nextPath);
            setHistoryIndex(historyIndex + 1);
            await listFiles(nextPath);
        }
    };

    // 文件排序
    const sortFiles = (files: FileInfo[], sortBy: string) => {
        return files.sort((a, b) => {
            if (sortBy === "name") {
                return a.name.localeCompare(b.name);
            } else if (sortBy === "size") {
                return b.size - a.size;
            } else if (sortBy === "date") {
                return b.created - a.created;
            }
            return 0;
        });
    };

    // 列出文件
    const listFiles = async (dir: string, query: string = "") => {
        const startTime = Date.now();
        try {
            const response = await invoke("list_files", {
                directory: dir,
                searchQuery: query || "",
            }) as {
                files: FileInfo[];
                total_files: number;
                total_folders: number;
            };
            const sortedFiles = sortFiles(response.files, sortBy);
            setFiles(sortedFiles);
            setTotalFiles(response.total_files);
            setTotalFolders(response.total_folders);
            addToHistory(dir);
        } catch (error) {
            console.error("Error listing files:", error);
        } finally {
            const endTime = Date.now();
            setQueryTime(endTime - startTime);
        }
    };

    // 点击文件夹
    const handleFolderClick = async (path: string) => {
        setDirectory(path);
        setSearchQuery("");
        await listFiles(path);
    };

    // 搜索文件
    const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
        await listFiles(directory, query);
    };

    // 排序方式变化
    const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newSortBy = e.target.value;
        setSortBy(newSortBy);
        const sortedFiles = sortFiles(files, newSortBy);
        setFiles(sortedFiles);
    };

    // 点击文件
    const handleFileClick = (file: FileInfo) => {
        setSelectedFile(file);
    };

    // 关闭模态框
    const closeModal = () => {
        setSelectedFile(null);
    };

    // 格式化日期
    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
    };

    // 格式化文件大小
    const formatSize = (size: number) => {
        if (size < 1024) {
            return `${size} B`;
        } else if (size < 1024 * 1024) {
            return `${(size / 1024).toFixed(2)} KB`;
        } else {
            return `${(size / (1024 * 1024)).toFixed(2)} MB`;
        }
    };

    // 根据文件类型获取图标
    const getFileIcon = (fileName: string) => {
        // 使用正则表达式提取最后一个点后面的扩展名
        const extension = fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
        console.log(`File: ${fileName}, Extension: ${extension}`); // 调试日志

        switch (extension) {
            case "jpg":
            case "jpeg":
            case "png":
            case "gif":
                return faFileImage;
            case "pdf":
                return faFilePdf;
            case "doc":
            case "docx":
                return faFileWord;
            case "xls":
            case "xlsx":
                return faFileExcel;
            case "ppt":
            case "pptx":
                return faFilePowerpoint;
            case "html":
            case "css":
            case "js":
            case "json":
                return faFileCode;
            case "mp3":
            case "wav":
                return faFileAudio;
            case "mp4":
            case "avi":
            case "mkv":
                return faFileVideo;
            case "zip":
            case "rar":
            case "tar":
            case "gz":
                return faFileArchive;
            default:
                return faFile;
        }
    };


    // 右键菜单
    const handleContextMenu = (e: React.MouseEvent, file: FileInfo) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            file: file,
        });
    };

    // 关闭右键菜单
    const closeContextMenu = () => {
        setContextMenu({visible: false, file: null});
    };

    // 删除文件
    const handleDelete = async () => {
        if (contextMenu.file) {
            try {
                await invoke("delete_file", {path: contextMenu.file.path});
                await listFiles(directory); // 刷新文件列表
            } catch (error) {
                console.error("Error deleting file:", error);
            } finally {
                closeContextMenu();
            }
        }
    };

    // 重命名文件
    const handleRename = async () => {
        if (contextMenu.file) {
            const newName = prompt("请输入新文件名：", contextMenu.file.name);
            if (newName) {
                try {
                    await invoke("rename_file", {
                        oldPath: contextMenu.file.path,
                        newName: newName,
                    });
                    await listFiles(directory); // 刷新文件列表
                } catch (error) {
                    console.error("Error renaming file:", error);
                } finally {
                    closeContextMenu();
                }
            }
        }
    };

    // 复制文件
    const handleCopy = () => {
        if (contextMenu.file) {
            setClipboard(contextMenu.file.path);
            closeContextMenu();
        }
    };

    // 粘贴文件
    const handlePaste = async () => {
        if (clipboard && contextMenu.file) {
            try {
                await invoke("paste_file", {
                    sourcePath: clipboard,
                    targetPath: contextMenu.file.is_dir ? contextMenu.file.path : directory,
                });
                await listFiles(directory); // 刷新文件列表
            } catch (error) {
                console.error("Error pasting file:", error);
            } finally {
                closeContextMenu();
            }
        }
    };

    // 路径输入自动补全
    const handleDirectoryInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        setDirectory(inputValue);

        // 如果路径以 / 结尾，则不调用自动补全
        if (inputValue.endsWith("/")) {
            setAutoCompletePaths([]);
            return;
        }

        try {
            const paths = await invoke("auto_complete_path", {partialPath: inputValue}) as string[];
            setAutoCompletePaths(paths);
        } catch (error) {
            console.error("Error auto-completing path:", error);
        }
    };

    return (
        <main className="container" onClick={closeContextMenu}>
            <div className="navigation-bar">
                <div className="navigation-buttons">
                    <button onClick={handleBack} disabled={historyIndex <= 0}>
                        &lt; {/* 左箭头 */}
                    </button>
                    <button
                        onClick={handleForward}
                        disabled={historyIndex >= history.length - 1}
                    >
                        &gt; {/* 右箭头 */}
                    </button>
                </div>
                <div className="directory-path">
                    <input
                        type="text"
                        value={directory}
                        onChange={handleDirectoryInput}
                        placeholder="输入目录路径..."
                        ref={directoryInputRef}
                    />
                    {autoCompletePaths.length > 0 && (
                        <div className="auto-complete-dropdown">
                            {autoCompletePaths.map((path, index) => (
                                <div
                                    key={index}
                                    className="auto-complete-item"
                                    onClick={() => {
                                        setDirectory(path);
                                        setAutoCompletePaths([]);
                                    }}
                                >
                                    {path}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="search-box">
                <input
                    type="text"
                    placeholder="搜索文件或文件夹..."
                    value={searchQuery}
                    onChange={handleSearch}
                />
            </div>

            <div className="sort-box">
                <label>排序方式：</label>
                <select value={sortBy} onChange={handleSortChange}>
                    <option value="name">按名称</option>
                    <option value="size">按大小</option>
                    <option value="date">按日期</option>
                </select>
            </div>

            <div className="file-stats">
                <span>文件夹总数: {totalFolders}</span>
                <span>文件总数: {totalFiles}</span>
                <span>总大小: {formatSize(totalSize)}</span>
                <span>查询耗时: {queryTime}ms</span>
            </div>

            <div className="file-list">
                <div className="file-header">
                    <span className="header-name">名称</span>
                    <span className="header-size">大小</span>
                    <span className="header-created">创建时间</span>
                </div>
                {files.map((file, index) => (
                    <div
                        key={index}
                        className={`file-item ${file.is_dir ? "folder" : "file"}`}
                        onClick={() => {
                            if (file.is_dir) {
                                handleFolderClick(file.path);
                            } else {
                                handleFileClick(file);
                            }
                        }}
                        onContextMenu={(e) => handleContextMenu(e, file)}
                    >
                        <span className="file-icon-left">
                            {file.is_dir ? (
                                <FontAwesomeIcon icon={faFolder}/>
                            ) : (
                                <FontAwesomeIcon icon={getFileIcon(file.name)}/>
                            )}
                        </span>
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{formatSize(file.size)}</span>
                        <span className="file-created">{formatDate(file.created)}</span>
                    </div>
                ))}
            </div>

            {selectedFile && (
                <div className="modal">
                    <div className="modal-content">
                        <h2>文件详情</h2>
                        <p><strong>名称:</strong> {selectedFile.name}</p>
                        <p><strong>路径:</strong> {selectedFile.path}</p>
                        <p><strong>大小:</strong> {formatSize(selectedFile.size)}</p>
                        <p><strong>创建时间:</strong> {formatDate(selectedFile.created)}</p>
                        <button onClick={closeModal}>关闭</button>
                    </div>
                </div>
            )}

            {contextMenu.visible && (
                <div className="context-menu-modal">
                    <div className="context-menu-content">
                        <button onClick={handleCopy}>复制</button>
                        <button onClick={handlePaste}>粘贴</button>
                        <button onClick={handleRename}>重命名</button>
                        <button onClick={handleDelete}>删除</button>
                        <button onClick={closeContextMenu}>取消</button>
                    </div>
                </div>
            )}
        </main>
    );
}

export default App;
