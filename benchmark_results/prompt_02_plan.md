# Prompt 2

**Mode**: plan
**Question**: Implement a binary search tree in Python with insert and delete methods.

---

```python
class Node:
    def __init__(self, key):
        self.left = None
        self.right = None
        self.val = key

def insert(root, key):
    if root is None:
        return Node(key)
    else:
        if root.val < key:
            root.right = insert(root.right, key)
        else:
            root.left = insert(root.left, key)
    return root

def delete(root, key):
    if root is None:
        return root
    if root.val > key:
        root.left = delete(root.left, key)
    elif root.val < key:
        root.right = delete(root.right, key)
    else:
        if root.left is None:
            return root.right
        elif root.right is None:
            return root.left
        root.val = min_value(root.right)
        root.right = delete(root.right, root.val)
    return root

def min_value(node):
    current = node
    while current.left is not None:
        current = current.left
    return current.val

# Example usage:
root = None
root = insert(root, 8)
root = insert(root, 3)
root = insert(root, 10)
root = insert(root, 1)
root = insert(root, 6)
root = insert(root, 14)
root = insert(root, 4)
root = insert(root, 7)
root = insert(root, 13)

# Delete a node
root = delete(root, 10)
```