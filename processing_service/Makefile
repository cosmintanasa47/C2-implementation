CXX		:= g++
CXXFLAGS := -std=c++17 -Wall -Wextra -I include
LDLIBS   := -lsqlite3
TARGET   := drone_import

$(TARGET): read_process_write.cpp
	$(CXX) $(CXXFLAGS) read_process_write.cpp $(LDLIBS) -o $(TARGET)

clean:
	rm -f $(TARGET)
