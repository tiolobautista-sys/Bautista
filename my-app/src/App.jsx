import { useState, useEffect } from "react"
import { supabase } from "./supabase.client"

export default function App() {
  // STATE: stores all tasks from database
  const [tasks, setTasks] = useState([])

  // STATE: stores user input
  const [input, setInput] = useState("")

  // Runs once when page loads
  useEffect(() => {
    fetchTasks()
  }, [])

  // READ: Fetch tasks from Supabase
  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")

    if (error) {
      console.log("Error fetching:", error)
    } else {
      setTasks(data)
    }
  }

  // CREATE: Add new task
  const addTask = async () => {
    if (!input.trim()) return

    const { error } = await supabase
      .from("tasks")
      .insert([
        { name: input, is_done: false }
      ])

    if (error) {
      console.log("Insert error:", error)
    } else {
      setInput("")
      fetchTasks()
    }
  }

  // UPDATE: Mark task as done
  const markDone = async (id, currentStatus) => {
    const { error } = await supabase
      .from("tasks")
      .update({ is_done: !currentStatus })
      .eq("id", id)

    if (error) {
      console.log("Update error:", error)
    } else {
      fetchTasks()
    }
  }

  // DELETE: Remove task
  const deleteTask = async (id) => {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)

    if (error) {
      console.log("Delete error:", error)
    } else {
      fetchTasks()
    }
  }

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>TODO LIST</h1>

      {/* INPUT FIELD */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        style={{ padding: "5px", marginRight: "10px" }}
        placeholder="Enter a task..."
      />

      {/* ADD BUTTON */}
      <button onClick={addTask}>
        Add Task
      </button>

      <ul>
        {tasks.map((task) => (
          <li
            key={task.id}
            style={{
              marginTop: "10px",
              textDecoration: task.is_done ? "line-through" : "none"
            }}
          >
            {task.name}

            {/* MARK DONE BUTTON */}
            <button
              onClick={() => markDone(task.id, task.is_done)}
              style={{ marginLeft: "10px" }}
            >
              {task.is_done ? "Undo" : "Done"}
            </button>

            {/* DELETE BUTTON */}
            <button
              onClick={() => deleteTask(task.id)}
              style={{ marginLeft: "10px" }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}